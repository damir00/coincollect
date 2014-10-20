
/*
 * GET home page.
 */

redis = require("redis");

function cc(coin,price,volume) {
	return {name:coin,price:price,volume:volume};
}

var coins=[];

function iterate_cache(r,data,index,func_end) {

	if(index>=data.length) {
		func_end();
		r.quit();
		return;
	}

	r.get(data[index],function(err,response) {
		if(!err) {
			var params=response.split(",");
			coins.push({name:params[0],price:params[1],volume:params[2],total_coins:params[3],old_price:params[4]});
		}
		iterate_cache(r,data,index+1,func_end);
	});
}

function cache_get_coins(callback) {

	var r=redis.createClient();
	coins=[];

	r.keys(["current:*"],function(err,response) {
		if(err) return;

		iterate_cache(r,response,0,function() {
			callback(coins);		
		});
	});
}

exports.index = function(req, res){
	cache_get_coins(function(coins) {
		res.render('index', { 
			title: "Coinsworth",
			coins:coins
		});
	});
};
exports.detail=function(req, res){
	var coin_name=req.url.substr(1).toUpperCase();
	if(coin_name=="") {
		res.redirect("/");
		return;
	}

	var coin={name:coin_name};

	res.render('detail', {
		title: "Coinsworth - "+coin.name,
		coin:coin
	});
	
};


