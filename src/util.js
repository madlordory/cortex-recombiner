/**
 * Created by madlord on 16/2/1.
 */
var semver=require('semver');
var fs=require('fs');
var path =require('path');

function mkdirsSync(dirpath, mode) {
    if (!fs.existsSync(dirpath)) {
        var pathtmp="/";
        dirpath.split(path.sep).forEach(function(dirname) {
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


var copy_dir = function( src, dst ){
    // 读取目录中的所有文件/目录
    var paths=fs.readdirSync( src);
    paths.forEach(function( path ){
        var _src = src + '/' + path,
            _dst = dst + '/' + path;
        var st=fs.statSync( _src);
        if( st.isFile() ){

            fs.writeFileSync(_dst,fs.readFileSync( _src ));
        }
        // 如果是目录则递归调用自身
        else if( st.isDirectory() ){
            exists( _src, _dst, copy_dir );
        }
    });
};
// 在复制目录前需要判断该目录是否存在，不存在需要先创建目录
var exists = function( src, dst, callback ){
    if( fs.existsSync(dst) ){
        callback( src, dst );
    }
    // 不存在
    else{
        fs.mkdirSync(dst);
        callback( src, dst );
    }
};

var copy=function(src,dst) {
    if (fs.existsSync(src)&&fs.statSync(src).isFile()) {
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

function chooseCorrectVersion(cortex_config,versions,pkg_name,noBeta) {
    var rule=cortex_config.dependencies[pkg_name];
    var filtedVersions=[];
    versions.forEach(function (item) {
        var version=item;
        if ((!noBeta)||(item.indexOf('beta')==-1)) {
            item=item.split('-')[0];
            if (!rule||(rule&&semver.satisfies(item,rule))) {
                filtedVersions.push(version);
            }
        }
    });
    filtedVersions.sort();
    return filtedVersions[filtedVersions.length-1];

}

function fixRequire(code) {
    var resultCode=code;


    resultCode= resultCode.replace(/require\.resolve\((\s)*["'][\S]+['"](\s)*\)/g, function (word) {//require.resolve("xxx")
        return word.replace(/require\.resolve\((\s)*/g,"require(");
    });

    resultCode= resultCode.replace(/require\.async\((\s)*["'][\S]+['"](\s)*,/g, function (word) {//require.async("xxx")
        word=word.replace(/require\.async\((\s)*/g,"require([").replace(',','],');
        return word.replace(/["'](\S)+["']/,function(_p) {
            if (_p.length>3&&_p[1]!='.'&&_p[1]!='/'&&_p[1]!='@') {
                return '"@cortex/'+_p.substring(1,_p.length-1)+'"';
            } else {
                return _p;
            }
        })
    });

    resultCode= resultCode.replace(/require(\s)*\((\s)*["'](\S)+["'](\s)*\)/g, function (word) {//require("xxx")
        return word.replace(/["'](\S)+["']/,function(_p) {
            if (_p.length>3&&_p[1]!='.'&&_p[1]!='/'&&_p[1]!='@') {
                return '"@cortex/'+_p.substring(1,_p.length-1)+'"';
            } else {
                return _p;
            }
        })
    });

    return resultCode;
}

module.exports={
    mkdirsSync:mkdirsSync,
    copy_dir:copy_dir,
    exists:exists,
    copy:copy,
    deleteFolderRecursive:deleteFolderRecursive,
    chooseCorrectVersion:chooseCorrectVersion,
    fixRequire:fixRequire
}