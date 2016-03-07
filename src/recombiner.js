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

    if (fs.existsSync(target_path)) {//删除/node_modules/@cortex文件夹
        util.deleteFolderRecursive(target_path);
    }
    fs.mkdirSync(target_path);//重新创建/node_modules/@cortex文件夹
    if (!fs.existsSync(source_path)) {//是否存在/neurons文件夹
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
    });//遍历收集neurons文件夹下的包文件夹
    packages.forEach(function(item){//对每个cortex包进行处理
        var currentModuleName=item;
        var dir_s=fs.readdirSync(source_path+'/'+item);
        var ver=util.chooseCorrectVersion(cortex_config,dir_s,item,options.noBeta,source_path+'/'+item);
        var src_path=source_path+'/'+item+'/'+ver;//选择本地最新的cortex包版本
        var dst_path=target_path+'/'+item;//设置node_modules/@cortex/文件夹下对于的包路径

        if (!fs.existsSync(dst_path)) {
            fs.mkdirSync(dst_path);//判断目标目录是否存在
        }
        util.copy_dir(src_path,dst_path);//文件夹拷贝src->dest
        fs.readdirSync(dst_path).forEach(function (item) {
            if (fs.statSync(dst_path+'/'+item).isFile()&&item=='cortex.json') {
                fs.renameSync(dst_path+'/'+item,dst_path+'/package.json');
            } else if (fs.statSync(dst_path+'/'+item).isFile()&&path.extname(item)=='.js') {//针对包根目录js
                fs.unlinkSync(dst_path+'/'+item);//删除js文件
                util.processJS(src_path+'/'+item,dst_path,currentModuleName);
            }
        });
        var cortexConf=JSON.parse(fs.readFileSync(src_path+'/cortex.json','utf8'));
        if (cortexConf&&cortexConf.entries) {
            cortexConf.entries.forEach(function(entry){
                fs.unlinkSync(path.join(dst_path,entry));//删除js文件
                util.processJS(path.join(src_path,entry),dst_path,currentModuleName);
            });
        }
    });
}

module.exports=recombinder;