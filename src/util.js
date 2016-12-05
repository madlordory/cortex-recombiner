/**
 * Created by madlord on 16/2/1.
 */
var semver = require('semver');
var fs = require('fs');
var path = require('path');

function mkdirsSync(dirpath, mode) {
    if (!fs.existsSync(dirpath)) {
        var pathtmp = "/";
        dirpath.split(path.sep).forEach(function (dirname) {
            if (pathtmp) {
                pathtmp = path.join(pathtmp, dirname);
            }
            else {
                pathtmp = dirname;
            }
            if (!fs.existsSync(pathtmp)) {
                if (!fs.mkdirSync(pathtmp, mode)) {
                    return false;
                }
            }
        });
    }
    return true;
}


var copy_dir = function (src, dst) {
    // 读取目录中的所有文件/目录
    var paths = fs.readdirSync(src);
    paths.forEach(function (path) {
        var _src = src + '/' + path,
            _dst = dst + '/' + path;
        var st = fs.statSync(_src);
        if (st.isFile()) {

            fs.writeFileSync(_dst, fs.readFileSync(_src));
        }
        // 如果是目录则递归调用自身
        else if (st.isDirectory()) {
            exists(_src, _dst, copy_dir);
        }
    });
};
// 在复制目录前需要判断该目录是否存在，不存在需要先创建目录
var exists = function (src, dst, callback) {
    if (fs.existsSync(dst)) {
        callback(src, dst);
    }
    // 不存在
    else {
        fs.mkdirSync(dst);
        callback(src, dst);
    }
};

var copy = function (src, dst) {
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        fs.createReadStream(src).pipe(fs.createWriteStream(dst));
    }
}
function deleteFolderRecursive(path) {
    var files = [];
    if (fs.existsSync(path)) {
        files = fs.readdirSync(path);
        files.forEach(function (file, index) {
            var curPath = path + "/" + file;
            if (fs.statSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};

function isCorrectVersion(ver, semiver, noBeta) {
    var rule = semiver;
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
}

function chooseCorrectVersion(semver, versions, noBeta) {
    var filtedVersions = [];
    versions.forEach(function (item) {
        if (isCorrectVersion(item, semver, noBeta)) {
            filtedVersions.push(item);
        }
    });
    filtedVersions.sort();
    return filtedVersions[filtedVersions.length - 1];
}

function fixRequire(code) {
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

function processJS(src, dst_path, currentModuleName) {
    if (fs.existsSync(src)) {//读取删除js对应的源js文件
        var code = fs.readFileSync(src, 'utf8');
        code = fixRequire(code);//处理require关键字
        var fc = new Function("" +
            "var result=[];" +
            "function  define(alias,dep,func,conf) {" +
            "result.push({key:alias,code:func.toString(),isMain:!!conf.main});" +
            "}" + '\n' +
            code + '\n' +
            "return result;" +
            "");

        var result = fc();
        result.forEach(function (obj) {
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
                mkdirsSync(path.dirname(dst_path + module_path));
                fs.writeFileSync(dst_path + module_path, code);
            }
        });
    }
}

module.exports = {
    mkdirsSync: mkdirsSync,
    copy_dir: copy_dir,
    exists: exists,
    copy: copy,
    deleteFolderRecursive: deleteFolderRecursive,
    chooseCorrectVersion: chooseCorrectVersion,
    fixRequire: fixRequire,
    processJS: processJS
}
