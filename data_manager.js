var redis=require("redis");
var tools=require("./tools");
var flot_graph=require("./flot_graph");

var DataManager=function() {
	var cache_graph_intervals=[60,5*60,30*60,1*60*60,4*60*60,12*60*60,24*60*60,3*24*60*60];
	var cache_graph_max_values=300;

	var redis_client=redis.createClient();

	var job_graphs=new tools.JobQueue();
	job_graphs.concurrency=1;

	var job_redis=new tools.JobQueue();
	job_redis.concurrency=20;

	function get_cache_graph_id(coin,exchange,interval) {
		return "graph:"+coin+":"+exchange+":"+interval;
	}
	function get_cache_current_id(coin,exchange) {
		return "current:"+coin+":"+exchange;
	}

	function get_graph_data(id,func) {
		redis_client.zrange([id,0,-1],function(err,data) {
			if(err) {
				func([]);
				return;
			}
			var d=[];
			for(i in data) {
				var params=data[i].split(",");
				d.push([parseFloat(params[0]),parseFloat(params[1])]);
			}
			func(d);
		});
	}

	//JSON graphs
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
	function json_graph_update(key,data,on_done) {
		var score=data[0];
		redis_client.zremrangebyscore([key,score,score],function(err,resp) {
			json_graph_add(key,data,on_done);
		});
	}
	function json_graph_add(key,data,on_done) {
		redis_client.zadd([key,data[0],JSON.stringify(data)],function(err,resp) {
			on_done();
		});
	}

	//store
	this.store_coin=function(timestamp,data) {	

		for(i in cache_graph_intervals) {
			var interval=cache_graph_intervals[i];
			var g=get_cache_graph_id(data.coin,"USD",interval);

			//update graph caches
			(function(graph,interval) {

				job_redis.add(function(job_done) {

					//check last timestamp
					redis_client.zrange([graph,-1,-1,"withscores"],function(err,response) {

						if(err || response.length<2 || parseInt(response[1])+interval*1000<timestamp) {

							//insert new data
							redis_client.zadd([graph,timestamp,timestamp+","+data.rate],function(err,response) {});

							//check cache size
							redis_client.zcount([graph,"-inf","+inf"],function(err,response) {
								if(err) return;
								var delete_count=parseInt(response)-cache_graph_max_values;
								if(delete_count>0) {
									//delete data at head
									redis_client.zremrangebyrank([graph,0,delete_count-1],function(err,response) { job_done(); });
								}
								else {
									job_done();
								}
							});
						}
						else {
							job_done();
						}
					});
				});

			}(g,interval));
		}

		//current info
		job_redis.add(function(job_done) {
			var graph=get_cache_graph_id(data.coin,"USD",60);
			redis_client.zrange([graph,0,0],function(err,response) {
				if(err) {
					job_done();
					return;
				}
				var old_price=response[0].split(",")[1];

				var params=[data.coin,data.rate,data.volume,data.total_coins,old_price].join(",");
				redis_client.set([get_cache_current_id(data.coin,"USD"),params],function(e,r) {
					job_done();
				});
			});
		});

		job_graphs.add(function(on_end) {
			//console.time("graph");
			get_graph_data(get_cache_graph_id(data.coin,"USD",3600),function(d) {
				var options = {
					width: 200,
					height: 70,
					canvas: true,
					xaxes: [ { mode: "time",ticks:false } ],
					yaxes: [ { ticks:false }, { } ],
				}
				flot_graph.render_to_png(options,d,__dirname+"/public/images/graph/"+data.coin+".png",function() { 
					//console.timeEnd("graph");
					on_end();
				});
			});
		});

		//console.log("redis jobs: "+job_redis.length());
		//console.log("graph jobs: "+job_graphs.length());
	}

	//trades
	var manager=this;

	this.trade=new function() {
		//trade:
		//-timestamp
		//-exchange
		//-market
		//-coin
		//-price
		//-amount

		//candle:
		//-timestamp (at start)
		//-open
		//-close
		//-low
		//-high
		//-amount

		var own=this;

		var candle_intervals=[60,15*60];
		var candle_max_values=200;

		function candle_get_hash(market_hash,interval) {
			return "candle:"+market_hash+":"+interval;
		}

		var last_trades={};
		function market_hash(from) {
			return from.exchange+":"+from.market+":"+from.coin;
		}

		this.is_valid=function(trade) {
			return (trade &&
				trade.timestamp &&
				trade.exchange &&
				trade.market &&
				trade.coin &&
				trade.price &&
				trade.amount);
		}

		var trade_jobs=new tools.JobQueue();
		trade_jobs.concurrency=1;

		this.add=function(trade) {

			function process_trade(trade,on_done) {
				var market=market_hash(trade);

				for(i in candle_intervals) {
					(function(interval) {
						trade_jobs.add(function(on_done) {
							var candle_key=candle_get_hash(market,interval);
							//get last candle
							json_graph_get(candle_key,1,function(data) {
								if(data.length==0) {	//empty set, add candle
									console.log("add first candle");
									json_graph_add(candle_key,[trade.timestamp,trade.price,trade.price,trade.price,trade.price,trade.amount],function() {
										on_done();
									});
									return;
								}
								data=data[0];
								if(trade.timestamp<data[0]) {
									//trade older than candle start, ignore
									console.log("ignore candle");
									on_done();
									return;
								}
								console.log("trade time "+trade.timestamp+", candle time "+data[0]);
								if(trade.timestamp>=data[0]+interval) {
									//add new candle
									json_graph_add(candle_key,[trade.timestamp,trade.price,trade.price,trade.price,trade.price,trade.amount],function() {
										on_done();
									});
									console.log("added candle");
								}
								else {
									//merge with last candle
									data[2]=trade.price;			//close
									data[3]=Math.min(data[3],trade.price);	//low
									data[4]=Math.max(data[4],trade.price);	//high
									data[5]+=trade.amount;			//amount
									json_graph_update(candle_key,data,function() {
										on_done();
									});
									console.log("merged candle");
								}
							});
						});
					})(candle_intervals[i]);
				}
			}


			if(!this.is_valid(trade)) {
				console.log("Invalid trade data from "+trade.exchange);
				console.log(JSON.stringify(trade));
				return;
			}
			if(this.get_last(trade).timestamp>=trade.timestamp) {
				//console.log("ignore trade "+trade.exchange+" market "+trade.market+"/"+trade.coin);
			}
			else {
				last_trades[market_hash(trade)]=trade;

				//console.log("add trade from "+trade.exchange+" market "+trade.market+"/"+trade.coin+" price "+trade.price+" amount "+trade.amount);
				process_trade(trade);

			}
		}
		//from:
		//-exchange
		//-market
		//-coin
		//callback:
		this.get_last=function(from) {
			return last_trades[market_hash(from)] || {};
		}

		//candles
		this.candles_get=function(interval,count) {
		}
		
	}

	this.test=function() {
		/*
		redis_client.zrange(["test",0,-1,"withscores"],function(err,replies) {
			for(i in replies) {
				var r=replies[i];
				console.log("have data: "+r);
			}
		});
		*/

		var test_data=[];
		for(i=0;i<10;i++) {
			test_data.push([i,i+10]);
		}

		redis_client.del(["test"],function(err,resp) {

			function test_add(data,index,on_done) {
				if(index>=data.length) {
					on_done();
					return;
				}
				json_graph_add("test",data[index],function() {
					test_add(data,index+1,on_done);
				});
			}
			test_add(test_data,0,function() {
				json_graph_update("test",[9,101],function() {
					json_graph_get("test",100,function(data) {
						console.log("data size "+data.length);
						for(i in data) {
							console.log(i+": "+JSON.stringify(data[i]));
						}
					});
					json_graph_get("test",1,function(data) {
						console.log("data 1: "+data.length);
					});
				});
			});

		});

	}
};

module.exports={
	DataManager:DataManager,
};


