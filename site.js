
/**
 * Module dependencies.
 */

var	express = require("express"),
	routes = require("./routes"),
	redis = require("redis");

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(require('stylus').middleware({ src: __dirname + '/public' }));
	app.use(app.router);
	app.use(express.static(__dirname + '/public'));
	app.use(express.compress());
	app.use("/price_graph",function(req, res){

		//res.writeHead(200, {"Content-Type": "application/json"});

		coin=req.url.substr(1).toUpperCase();

		var id="graph:"+coin+":USD:3600";
		var r=redis.createClient();
		r.zrange([id,0,-1],function(err,data) {
			r.quit();
			if(err) {
				res.end("");
				return;
			}
			var d=[];
			for(i in data) {
				var params=data[i].split(",");
				d.push([parseFloat(params[0]),parseFloat(params[1])]);
			}
			res.end(JSON.stringify(d));
		});
	});
	app.use("/trade_graph",function(req,res) {

		var redis_client=redis.createClient();
		function json_graph_get(key,count,func) {
			redis_client.zrange([key,-1-(count-1),-1],function(err,data) {
				if(err) {
					func([]);
					return;
				}
				var d=[];
				for(i in data) {
					d.push(JSON.parse(data[i]));
				}
				func(d);
			});
		}

		var coin=req.url.substr(1).toUpperCase();
		json_graph_get("candle:mintpal:BTC:"+coin+":900",30,function(data) {
			redis_client.quit();
			res.end(JSON.stringify(data));
		});

	});
	app.use('/detail', routes.detail);

});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes

app.get('/', routes.index);


app.listen(3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});

