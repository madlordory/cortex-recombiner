/**
 * Created by madlord on 2016/12/5.
 */
"use strict"
const fs = require('fs');
const fsep = require('fs-extra-promise');
const semver = require('semver');
const _ = require('lodash');
const path = require('path');
module.exports = {
    /*
    * 根据提供的versions数组中选出最符合sem_ver表达式的版本号
    * */
    chooseCorrectVersion: function (sem_ver, versions, noBeta) {
        let filtedVersions = versions && _.map(versions, function (item) {
                if (utils.isCorrectVersion(item, sem_ver, noBeta)) {
                    return item;
                }
            }) || [];
        filtedVersions=_.filter(filtedVersions,function (value) {
            return !!value;
        }).sort();
        return filtedVersions[filtedVersions.length - 1];
    },
    /*
    * ver版本号是否满足sem_ver表达式
    * */
    isCorrectVersion: function (ver, sem_ver, noBeta) {
        let rule = sem_ver;
        if ((!noBeta) || (ver.indexOf('beta') == -1)) {
            ver = ver.split('-')[0];
            try {
                if (!rule || (rule && semver.satisfies(ver, rule))) {
                    return true;
                }
            } catch (e) {
                return false;
            }
        }
        return false;
    },

    /*
     * 将neurons下指定包名和版本的pkg迁移到dest目录下
     * source_path通常为./neurons/
     * 返回转换后的包目录
     * */
    transformCortexPkg: function (source_path, pkg_name, ver, dest) {
        return function*() {
            var src_path = path.join(source_path, pkg_name, ver);//选择本地最新的cortex包版本
            var dst_path = path.join(dest, pkg_name);//设置node_modules/@cortex/文件夹下对于的包路径

            yield fsep.mkdirsAsync(dst_path);
            yield fsep.copyAsync(src_path, dst_path);//文件夹拷贝src->dest

            let dirs = fs.readdirSync(dst_path);
            yield dirs && _.map(dirs, function (item) {
                return function*() {
                    let src_path_item = path.join(src_path, item);
                    let dst_path_item = path.join(dst_path, item);
                    if (fs.statSync(dst_path_item).isFile() && item == 'cortex.json') {

                        var obj = yield fsep.readJsonAsync(dst_path_item);
                        if (obj.hasOwnProperty('dependencies')) {
                            let dep = {};
                            let keys = _.keys(obj.dependencies);
                            _.map(keys, function (key) {
                                dep['@cortex/' + key] = obj.dependencies[key];
                            })
                            obj.dependencies = dep;
                        }
                        if (obj.hasOwnProperty('devDependencies')) obj.devDependencies = {};
                        fs.writeFileSync(path.join(dst_path, '/package.json'), JSON.stringify(obj, undefined, 4));//必须创建package.json否则会提示错误
                        // fs.renameSync(dst_path+'/'+item,dst_path+'/package.json');
                    } else if (fs.statSync(dst_path_item).isFile() && path.extname(item) == '.js') {//针对包根目录js
                        fs.unlinkSync(dst_path_item);//删除js文件
                        yield utils.processJS(src_path_item, dst_path, pkg_name);
                    }
                }
            })||[];

            return dst_path;
        }
    },


    /*
     * 处理指定目录下的包的依赖关系
     * pkg_dir_path通常为node_modules/@cortex/xxx
     * */

    processDependencies: function (pkg_dir_path, CORTEX_PACKAGES,OPTIONS) {
        return function*() {
            var pkg_json_path = path.join(pkg_dir_path, 'package.json');
            if (fs.existsSync(pkg_json_path)) {
                var json = yield fsep.readJsonAsync(pkg_json_path);
                try {
                    yield json && json.dependencies && _.map(json.dependencies, function (sem_ver, pkg) {
                        return function*() {
                            if (pkg.indexOf('@cortex/') != -1) {
                                pkg = pkg.substring(8);
                            }
                            var prefer_ver = utils.chooseCorrectVersion(sem_ver, CORTEX_PACKAGES[pkg].versions, OPTIONS.noBeta);
                            var currentTopLevelVer = CORTEX_PACKAGES[pkg].top;
                            /*
                            * 处理cortex包内部对其他cortex包的依赖关系
                            * 如果所依赖的cortex包版本已处于顶级cortex包内，则不做任何动作，否则，将所需的版本的包拷入对应cortex包自己的node_modules/@cortex/xxx中
                            * */
                            if (prefer_ver != currentTopLevelVer) {
                                let cortex_path = path.join(pkg_dir_path, 'node_modules', '@cortex')
                                yield fsep.ensureDirAsync(cortex_path);
                                var dest_path = yield utils.transformCortexPkg(OPTIONS.source_path,pkg, prefer_ver, cortex_path);
                                yield utils.processDependencies(dest_path, CORTEX_PACKAGES, OPTIONS);
                            }
                        }

                    })||[];
                } catch (e) {
                    console.error(e.stack);
                }


            } else {
                throw new Error(pkg_json_path + " does not existed");
            }
        }
    },
    /*
    * 处理单个cortex包单个js文件的转换工作
    * */
    processJS: function (src, dst_path, currentModuleName) {
        return function* () {
            if (fs.existsSync(src)) {//读取删除js对应的源js文件
                var code = fs.readFileSync(src, 'utf8');
                code = utils.fixRequire(code);//处理require关键字
                var fc = new Function("" +
                    "var result=[];" +
                    "function  define(alias,dep,func,conf) {" +
                    "result.push({key:alias,code:func.toString(),isMain:!!conf.main});" +
                    "}" + '\n' +
                    code + '\n' +
                    "return result;" +
                    "");

                var result = fc();
                yield result && _.map(result, function (obj) {
                    return function*() {
                        var pkg_name = obj.key;
                        var code = obj.code;
                        var ss = code.substring(code.indexOf('{') + 1).split('}');
                        ss.pop();
                        code = ss.join('}');
                        //console.log(code);
                        var _t = pkg_name.split('@');
                        var module_name = _t[0];
                        var module_path = (_t[1].indexOf('/') != -1 ? _t[1].substring(_t[1].indexOf('/')) : '');
                        // _t => arttemplate@3.0.4/dist/template-native-debug.js
                        // _t[1] => 3.0.4/dist/template-native-debug.js
                        // module_path => /dist/template-native-debug.js
                        if (path.extname(module_path) === '.json') {
                            // json file
                            code = code.replace('module.exports = ', '');
                        }
                        if (module_name == currentModuleName && module_path) {
                            yield fsep.mkdirsAsync(path.dirname(path.join(dst_path, module_path)));
                            fs.writeFileSync(path.join(dst_path, module_path), code);
                        }
                    }
                })||[]
            }
        }

    },
    /*
    * 对cortex js文件中的require语句进行转换
    * */
    fixRequire: function (code) {
        var resultCode = code;

        function resolvePath(_p) {//".abc.js" ==> ".abc.js" or "abc/t.js" ==> "@cortex/abc/t.js"  or "/rle.js" ==> "/rle.js"
            if (_p.length > 1 && _p[0] != '.' && _p[0] != '/' && _p[0] != '@') {
                return '@cortex/' + _p;
            } else {
                return _p;
            }
        }


        /*
         * require("xxx") ==> require("xxx")
         * */
        resultCode = resultCode.replace(/require\s*\(\s*(["'])\s*([\S]+)\s*(["'])\s*\)/g, function (word, $1, $2, $3) {
            return "require(" + $1 + resolvePath($2) + $3 + ")";
        });


        /*
         * require.resolve("xxx") ===> require("!!file!xxx") 强制使用file-loader
         * */
        resultCode = resultCode.replace(/require\.resolve\s*\(\s*(["'])\s*([\S]+)\s*(['"])\s*\)/g, function (word, $1, $2, $3) {
            return "require(" + $1 + "!!file!" + resolvePath($2) + $3 + ")";
        });//

        /*
         *
         * require.async("xxx",callback) ==> require(["xxx"],callback)
         * */
        resultCode = resultCode.replace(/require\.async\s*\(\s*(["'])\s*([\S]+)\s*(['"])\s*,/g, function (word, $1, $2, $3) {
            return "require([" + $1 + resolvePath($2) + $3 + "],";
        });


        return resultCode;
    }

};
const utils = module.exports;