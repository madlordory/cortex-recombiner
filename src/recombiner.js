/**
 * Created by madlord on 16/2/1.
 */

var fs=require('fs');
var path =require('path');
var util=require('./util.js');
var assign=require('object-assign');

var defaultOpts={
    base:__dirname,
    source_path:'./neurons',
    target_path:'./node_modules/@cortex',
    cortex_json_file:'./cortex.json',
    noBeta:false
};


var recombinder=function (opts) {
    var options=assign(defaultOpts,opts);
    var source_path=path.join(options.base,options.source_path)
    var target_path=path.join(options.base,options.target_path);
    var cortex_json_file=path.join(options.base,options.cortex_json_file);
    var cortex_config=JSON.parse(fs.readFileSync(cortex_json_file));

    var packages=[];

    if (fs.existsSync(target_path)) {
        util.deleteFolderRecursive(target_path);
    }
    fs.mkdirSync(target_path);
    if (!fs.existsSync(source_path)) {
        return;
    }
    var files = fs.readdirSync(source_path);
    files.forEach(function(item) {
        var tmpPath = source_path + '/' + item,
            stats = fs.statSync(tmpPath);

        if (stats.isDirectory()&&item!='neuron') {
            packages.push(item);
        } else {
        }
    });
    packages.forEach(function(item){
        var currentModuleName=item;
        var dir_s=fs.readdirSync(source_path+'/'+item);
        var ver=util.chooseCorrectVersion(cortex_config,dir_s,item,options.noBeta,source_path+'/'+item);
        var src_path=source_path+'/'+item+'/'+ver;
        var dst_path=target_path+'/'+item;

        if (!fs.existsSync(target_path+ '/' + item)) {
            fs.mkdirSync(target_path+ '/' + item);
        }
        util.copy_dir(src_path,dst_path);
        fs.readdirSync(dst_path).forEach(function (item) {
            if (fs.statSync(dst_path+'/'+item).isFile()&&item=='cortex.json') {
                fs.renameSync(dst_path+'/'+item,dst_path+'/package.json');
            } else if (fs.statSync(dst_path+'/'+item).isFile()&&path.extname(item)=='.js') {
                fs.unlinkSync(dst_path+'/'+item);
            }
        });
        if (fs.existsSync(src_path+'/'+item+'.js')) {
            var code=fs.readFileSync(src_path+'/'+item+'.js','utf8');
            code=util.fixRequire(code);
            var fc=new Function("" +
                "var result=[];"+
                "function  define(alias,dep,func,conf) {"+
                "result.push({key:alias,code:func.toString(),isMain:!!conf.main});"+
                "}"+
                code+
                "return result;"+
                "");

            var result=fc();
            result.forEach(function (obj) {
                var pkg_name=obj.key;
                var code=obj.code;
                var ss=code.substring(code.indexOf('{')+1).split('}');
                ss.pop();
                code=ss.join('}');
                //console.log(code);
                var _t=pkg_name.split('@');
                var module_name=_t[0];
                var module_path=(_t[1].indexOf('/')!=-1?_t[1].substring(_t[1].indexOf('/')):'');
                if (module_name==currentModuleName&&module_path) {
                    util.mkdirsSync(path.dirname(dst_path+module_path));
                    fs.writeFileSync(dst_path+module_path,code);
                }
            });
        }
    });
}

module.exports=recombinder;