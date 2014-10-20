var jsdom=require("jsdom");
var fs = require('fs');


var window=null;


jsdom.env({
	html: '<html><body></div></body></html>', // URL or markup required
	scripts: [
		"file:///"+__dirname+"/jquery-1.6.4.min.js",
		"file:///"+__dirname+"/jquery.flot.js"
	],
	done: function (errors, _window) {
		if (errors) {
			console.log(errors);
			return;
		}

		// no `window` in node
		//var $ = window.$, jQuery = window.jQuery;
		window=_window;
		console.log("window inited");
	}
});


function render_to_png(options,data,filename,on_done) {
	if(!window) {
		console.log("window not yet inited");
		on_done();
		return;
	}

	var $ = window.$;
	var jQuery = window.jQuery;

	var $placeholder = $('');

	var flot_data=[{data:data}];

	// call Flot as usual
//console.log("render, param "+data[0][1]);

	var $plot = $.plot($placeholder, flot_data, options);

	// get the node-canvas instance
	var nodeCanvas = $plot.getCanvas();

	//$placeholder.remove();

	// write the file
	nodeCanvas.toBuffer(function (error, buffer) {
		if(error) throw error;
		//console.log("writing "+filename+" "+buffer.length);
		fs.writeFile(filename, buffer);
		//console.log("ok");
		on_done();
	});
}


/*
function render_to_png(options,data,filename,on_done) {
	jsdom.env({
		html: '<html><body></body></html>', // URL or markup required
		scripts: [
			"file:///"+__dirname+"/jquery-1.6.4.min.js",
			"file:///"+__dirname+"/jquery.flot.js"
		],
		done: function (errors, window) {
			if (errors) {
				console.log(errors);
				return;
			}

			// no `window` in node
			var $ = window.$, jQuery = window.jQuery;

			// differences from typical flot usage
			// jQuery (loaded via jsdom) can't determine element dimensions, so:
			// width and height options are required
			//var options = { width: 600, height: 300 };
			// we can just use a stub jQuery object
			var $placeholder = $('');

			var flot_data=[{data:data}];

			// call Flot as usual
			var $plot = $.plot($placeholder, flot_data, options);

			// get the node-canvas instance
			var nodeCanvas = $plot.getCanvas();

			// write the file
			nodeCanvas.toBuffer(function (error, buffer) {
				if(error) throw error;
				fs.writeFile(filename, buffer);
			});

			window.close();
			on_done();
		}
	});
}
*/



module.exports={
	render_to_png:function(options,data,filename,on_done) {
		//console.log("rendering to "+filename);
		render_to_png(options,data,filename,on_done);
	}
};


function test() {
	var data=[];
	for(i=0;i<100;i++) {
		data.push([i,Math.random()]);
	}
	var opts={width:160,height:80};


	(f=function(i) {
		if(i>2000) return;

		//console.log("count "+i);
		//console.time("graph");

		for(d in data) data[d][1]=Math.random();

		render_to_png(opts,data,__dirname+"/temp/test_"+i+".png",function() {
			//console.timeEnd("graph");
			setTimeout( function() { f(i+1); },0);
		});
	})(0);

	/*
	for(i=0;i<2000;i++) {
		for(d in data) data[d][1]=Math.random();

		console.log("count "+i);
		console.time("graph");
		render_to_png(opts,data,__dirname+"/temp/test_"+i+".png",function(){});
		console.timeEnd("graph");
	}
	*/

}

/*
(f=function() {
	if(!window) {
		setTimeout(f,100);
		return;
	}
	console.log("test");
	test();
})();
*/


