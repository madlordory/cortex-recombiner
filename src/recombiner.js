/**
 * Created by madlord on 16/2/1.
 */
"use strict"
var fs = require('fs');
var path = require('path');
var util = require('./util.js');
var assign = require('object-assign');
var _ = require('lodash');
var defaultOpts = {
    base: __dirname,
    source_path: './neurons',
    target_path: './node_modules/@cortex',
    cortex_json_file: './cortex.json',
    noBeta: false
};


var recombinder = function (opts) {
    var options = assign(defaultOpts, opts);
    var source_path = path.join(options.base, options.source_path)
    var target_path = path.join(options.base, options.target_path);
    var cortex_json_file = path.join(options.base, options.cortex_json_file);
    var cortex_config = JSON.parse(fs.readFileSync(cortex_json_file));

    var cortexPkgVersionsMap = {};
    var node_modules_at_cortex_pkg_version = {};
    var packages = [];

    if (fs.existsSync(target_path)) {//删除/node_modules/@cortex文件夹
        util.deleteFolderRecursive(target_path);
    }
    fs.mkdirSync(target_path);//重新创建/node_modules/@cortex文件夹
    if (!fs.existsSync(source_path)) {//是否存在/neurons文件夹
        return;
    }
    var files = fs.readdirSync(source_path);


    /*
    *
    * 创建所有cortex包的数组集合 packages=["request","hippo"]
    * */
    files.forEach(function (item) {
        var tmpPath = source_path + '/' + item,
            stats = fs.statSync(tmpPath);

        if (stats.isDirectory() && item != 'neuron' && item != cortex_config.name) {
            packages.push(item);
        } else {
        }
    });

    var tools = {
        /*
        * 将neurons下指定包名和版本的pkg迁移到dest目录下
        * */
        transformCortexPkg: function (pkg_name, ver, dest) {
            var src_path = source_path + '/' + pkg_name + '/' + ver;//选择本地最新的cortex包版本
            var dst_path = dest + '/' + pkg_name;//设置node_modules/@cortex/文件夹下对于的包路径

            if (!fs.existsSync(dst_path)) {
                fs.mkdirSync(dst_path);//判断目标目录是否存在
            }
            util.copy_dir(src_path, dst_path);//文件夹拷贝src->dest
            fs.readdirSync(dst_path).forEach(function (item) {
                if (fs.statSync(dst_path + '/' + item).isFile() && item == 'cortex.json') {
                    var jsonStr = fs.readFileSync(dst_path + '/' + item, 'utf8');
                    var resultStr = jsonStr;
                    var obj = JSON.parse(jsonStr);
                    if (obj.hasOwnProperty('dependencies')) {
                        let dep = {};
                        let keys = _.keys(obj.dependencies);
                        _.map(keys, function (key) {
                            dep['@cortex/' + key] = obj.dependencies[key];
                        })
                        obj.dependencies = dep;
                    }
                    if (obj.hasOwnProperty('devDependencies')) obj.devDependencies = {};
                    resultStr = JSON.stringify(obj, undefined, 4);
                    fs.writeFileSync(dst_path + '/package.json', resultStr);//必须创建package.json否则会提示错误
                    // fs.renameSync(dst_path+'/'+item,dst_path+'/package.json');
                } else if (fs.statSync(dst_path + '/' + item).isFile() && path.extname(item) == '.js') {//针对包根目录js
                    fs.unlinkSync(dst_path + '/' + item);//删除js文件
                    util.processJS(src_path + '/' + item, dst_path, pkg_name);
                }
            });
            var cortexConf = JSON.parse(fs.readFileSync(src_path + '/cortex.json', 'utf8'));
            if (cortexConf && cortexConf.entries) {
                cortexConf.entries.forEach(function (entry) {
                    if (fs.existsSync(path.join(src_path, entry))) {
                        fs.unlinkSync(path.join(dst_path, entry));//删除js文件
                        util.processJS(path.join(src_path, entry), dst_path, pkg_name);
                    }
                });
            }
            return dst_path;
        },


        /*
         * 处理指定node_modules/@cortex/下的包的依赖关系
         * */

        processDependencies: function (pkg_dir_path) {
            // var sub_dirs_of_node_modules_at_cortex = fs.readdirSync(target_path);
            // _.map(sub_dirs_of_node_modules_at_cortex,function (pkg_name) {
            // });
            var pkg_json_path = path.join(pkg_dir_path, 'package.json');
            if (fs.existsSync(pkg_json_path)) {
                var jsonStr = fs.readFileSync(pkg_json_path, 'utf8');
                var json = JSON.parse(jsonStr);
                json && json.dependencies && _.map(json.dependencies, function (sem_ver, pkg) {
                    if (pkg.indexOf('@cortex/') != -1) {
                        pkg = pkg.substring(8);
                    }
                    var prefer_ver = util.chooseCorrectVersion(sem_ver, cortexPkgVersionsMap[pkg], options.noBeta);
                    var currentTopLevelVer = node_modules_at_cortex_pkg_version[pkg];
                    if (prefer_ver != currentTopLevelVer) {
                        var cortex_path = "";
                        _.map([pkg_dir_path, 'node_modules', '@cortex'], function (v) {
                            cortex_path = path.join(cortex_path, v);
                            if (!fs.existsSync(cortex_path)) {
                                fs.mkdirSync(cortex_path);//判断目标目录是否存在
                            }
                        });


                        var dest_path = tools.transformCortexPkg(pkg, prefer_ver, cortex_path);
                        tools.processDependencies(dest_path);
                    }
                });

            } else {
                throw new Error(pkg_json_path + " does not existed");
            }

        }
    }


    /*
     * 将所有neurons下的最新版本的cortex包安装到node_modules/@cortex/下
     *
     * */

    function processAllCortexPack() {
        //遍历收集neurons文件夹下的包文件夹
        packages.forEach(function (item) {//对每个cortex包进行处理
            var currentModuleName = item;
            var dir_s = fs.readdirSync(source_path + '/' + item);

            /*
            * 创建每个cortex包的可选择版本映射
            * cortexPkgVersionsMap={
            *   "request"：【"0.2.7"，"1.0.3"】
            * }
            * */
            cortexPkgVersionsMap[item] = dir_s;
            var ver = util.chooseCorrectVersion(cortex_config.dependencies[item], dir_s, options.noBeta);

            /*
            *
            * 创建node_modules/@cortex下的顶级cortex包的版本映射
            *
            * node_modules_at_cortex_pkg_version={
            *   "request":"1.0.3"
            * }
            * */
            node_modules_at_cortex_pkg_version[item] = ver;
            tools.transformCortexPkg(item, ver, target_path);
        });
    }

    processAllCortexPack();



    /*
     *
     * 处理所有node_modules/@cortex/下的包的依赖关系
     * */

    function processAllDependencies() {
        if (fs.existsSync(target_path)) {
            var dirs = fs.readdirSync(target_path);
            dirs && _.map(dirs, function (pkg) {
                tools.processDependencies(path.join(target_path, pkg));
            });
        }
    }

    processAllDependencies();

}

module.exports = recombinder;