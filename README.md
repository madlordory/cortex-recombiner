# cortex-recombiner
recombine the cortex package structure to make it compatible with webpack

####How to use

````
var recombiner=require('cortex-recombiner');

...

recombiner({
        base:__dirname，	//the base dir path of webpack project
        source_path:'./neurons',	//the relative path of neurons source dir
    	target_path:'./node_modules/@cortex',	//the relative path of target dir where you want to recombine
    	cortex_json_file:'./cortex.json',	//the path of cortex config file
    	noBeta:false	//whether ignore cortex beta package in source_path
});

...


````
