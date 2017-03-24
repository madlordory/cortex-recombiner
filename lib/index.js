/**
 * Created by madlord on 2016/12/5.
 */
"use strict"
const co=require('co');
const path = require('path');
const fs=require('fs');
const fsep=require('fs-extra-promise');
const _=require('lodash');
const utils=require('./utils');
const defaultOpts = {
    base: __dirname,
    source_path: './neurons',
    target_path: './node_modules/@cortex',
    cortex_json_file: './cortex.json',
    noBeta: false
};
var OPTIONS={};
var CORTEX_JSON_CONFIG;
var CORTEX_PACKAGES={};
const TASK={
    init:function (opts) {
        return function* () {
            OPTIONS = Object.assign(defaultOpts, opts);
            if (!path.isAbsolute(OPTIONS.base)) {
                throw new Error('[cortex-recombiner] error: OPTIONS.base must be an absolute path!');
            }
            OPTIONS.source_path = path.isAbsolute(OPTIONS.source_path)&&OPTIONS.source_path||path.join(OPTIONS.base, OPTIONS.source_path);
            OPTIONS.target_path = path.isAbsolute(OPTIONS.target_path)&&OPTIONS.target_path||path.join(OPTIONS.base, OPTIONS.target_path);

            /*
             * 读取当前项目的cortex.json文件配置
             * */
            let cortex_json_file = path.join(OPTIONS.base, OPTIONS.cortex_json_file);
            if (!fs.existsSync(cortex_json_file)) {
                let e=new Error("It seems that your project did not include any cortex package");
                e.name="ignore";
                throw e;
                // console.info();
                return;
            }
            CORTEX_JSON_CONFIG=fsep.readJsonSync(cortex_json_file);

            let cortexPkgVersionsMap = {};
            let node_modules_at_cortex_pkg_version = {};

            /*
             * 清空 ./node_modules/@cortex文件夹
             * */
            yield fsep.ensureDirAsync(OPTIONS.target_path);
            yield fsep.emptyDirAsync(OPTIONS.target_path);





            /*
             *
             * 创建所有cortex包的Map集合 packages={"request":{},"hippo":{}]
             * */
            var files =fs.existsSync(OPTIONS.source_path)&&fs.readdirSync(OPTIONS.source_path)||[];
            if (files&&files.length==0) {
                throw new Error('dir neurons is empty, try run : cortex install --stable-only')
                return;
            }
            yield files&&_.map(files,function (item) {
                return function* () {
                    /**
                     * 移除 `item !== CORTEX_JSON_CONFIG.name` 的逻辑，兼容下面的使用场景：
                     *  - 在 cortex 项目中使用 npm 进行测试，需要将包自身也做转换，完全通过 npm 库完成测试。
                     */
                    if (fs.statSync(path.join(OPTIONS.source_path,item)).isDirectory() && item != 'neuron') {
                        CORTEX_PACKAGES[item]={};
                    }
                }
            })||[];
        }
    },
    transform_all_cortex_pkg_to_node_modules:function* () {
        /*
         *
         * 遍历收集neurons文件夹下的包文件夹
         * */
        yield CORTEX_PACKAGES&&_.map(CORTEX_PACKAGES,function (value,item) {//对每个cortex包进行处理
            return function* () {

                /*
                 * 记录每个cortex包的可选择版本以及@cortex目录下顶级cortex包的版本号
                 * CORTEX_PACKAGES={
                 *   "request"：{
                 *      versions:["0.2.7"，"1.0.3"],
                 *      top:"1.0.3"
                 *   }
                 * }
                 * */

                let versions=fs.readdirSync(path.join(OPTIONS.source_path,item));
                let prefered_ver=utils.chooseCorrectVersion(CORTEX_JSON_CONFIG.dependencies[item], versions, OPTIONS.noBeta);

                Object.assign(CORTEX_PACKAGES[item],{
                    versions:versions,
                    top:prefered_ver
                });

                /*
                 * 将cortex包转换为npm包
                 * */
                yield utils.transformCortexPkg(OPTIONS.source_path,item, prefered_ver, OPTIONS.target_path);
            }
        })||[];
    },
    process_dependencies:function* () {
        if (fs.existsSync(OPTIONS.target_path)) {
            var dirs = fs.readdirSync(OPTIONS.target_path);
            /*
             * 遍历所有node_modules/@cortex/下的目录
             * 处理每个包的依赖关系
             * */
            yield dirs && _.map(dirs, function (pkg) {
                return function* () {
                    yield utils.processDependencies(path.join(OPTIONS.target_path, pkg),CORTEX_PACKAGES,OPTIONS);
                }
            })||[];
        }
    }
}


module.exports=function (ops) {
    return co(function* () {
        console.log("cortex recombiner task start");
        yield TASK.init(ops);
        yield TASK.transform_all_cortex_pkg_to_node_modules;
        yield TASK.process_dependencies;
        console.log("cortex recombiner task end");
    }).catch(function(error) {
        if (error.name=='ignore') {
            console.warn('[cortex recombiner]  '+error.message);
            return Promise.resolve();
        } else {
            throw error;
        }
        // console.error(error);
        // console.error(error.stack);
    });
}
