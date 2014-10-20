var request=require("request");
var redis=require("redis");
var flot_graph=require("./flot_graph");
var data_manager=require("./data_manager");
var tools=require("./tools");

//coin metadata:
//code, name, 

//minute data:
//source, coin, exchange, rate, 24h volume

var collector={
	sources:[],
	coins:{},
	fiats:{},	//btc rate
	coin_totals:{},
	data_manager: new data_manager.DataManager(),

	add_source:function(src) {
		this.sources.push(src);
	},
	add_simple_source:function(id,interval,uri,func) {
		var t=this;

		this.add_source({
			id:id,
			interval:interval,
			collect:function(collector) {
				var tt=this;
				request( {uri: uri, method:"GET"},
					function(e,r,b) {
						try {
							if(e) {
								console.log(tt.id+" error: "+e);
								return;
							}
							func(t,b);
						}
						catch(e) {
							console.log(tt.id+" error: "+e);
						}
					});
			}
		});
	},
	start:function() {
		var t=this;
		for(i in this.sources) {
			var s=this.sources[i];
			new tools.Timer(function() {
				try {
					s.collect(t);
				}
				catch(e) {
					console.log("Source "+s.id+" collect error: "+e);
				}
			},s.interval*1000).start();
			console.log("Source "+s.id+" started");
		}
		new tools.Timer( function() {t.capture();} ,5*1000).start();
	},
	//rate & volume data
	collect:function(src,coin,exchange,rate,volume) {
		if(!src || !coin || !exchange) {
			console.log("invalid coin data");
			return;
		}
		if(rate==0) return;	//ignore 0 rate, it probably means no trades happened yet

		coin=coin.toUpperCase();
		exchange=exchange.toUpperCase();
		function parseFloatOrNull(val) {
			try {
				return parseFloat(val);
			}
			catch(e) {
				return null;
			}
		}

		var hash=src+"|"+coin+"|"+exchange;
		this.coins[hash]={
			src:src,
			coin:coin,
			exchange:exchange,
			rate:parseFloatOrNull(rate),
			volume:parseFloatOrNull(volume)
		};
	},
	//total coins in circulation data
	collect_total:function(src,coin,total) {
		if(!coin || !total) {
			console.log("Invalid coin total data from "+src);
			return;
		}
		this.coin_totals[coin]=total;
		//console.log("total "+coin+" coins: "+total);
	},
	collect_fiat:function(src,fiat,btc_rate) {
		if(!fiat || !btc_rate) {
			console.log("Invalid fiat data from "+src);
			return;
		}
		//console.log("FIAT "+fiat+": "+btc_rate);
		this.fiats[fiat]=btc_rate;
	},
	collect_trade:function(trade) {
		try {
			trade.timestamp=parseFloat(trade.timestamp);
			trade.price=parseFloat(trade.price);
			trade.amount=parseFloat(trade.amount);
			this.data_manager.trade.add(trade);
		}
		catch(e) {
			console.log("trade error: "+e);
		}
	},
	collect_trades:function(trades) {
		for(i in trades) {
			this.collect_trade(trades[i]);
		}
	},
	capture:function() {
		//merge coin data, normalize rates with BTC
		var merged_coins={};

		merged_coins["BTC"]={
			coin:"BTC",
			total_coins:this.coin_totals["BTC"],
			rates:[1],
			volumes:[0]
		};

		function convert_rate_btc(from,amount) {
			return amount;
		}

		for(i in this.coins) {

			var c=this.coins[i];
			var m=merged_coins[c.coin];

			if(c.exchange!="BTC") continue;

			//console.log("PAIR "+c.coin+" "+c.exchange);

			var btc_rate=convert_rate_btc(c.exchange,c.rate);
			var btc_volume=convert_rate_btc(c.exchange,c.volume);

			if(m) {
				m.rates.push(btc_rate);
				m.volumes.push(btc_volume);
			}
			else {
				merged_coins[c.coin]={
					coin:c.coin,
					total_coins:this.coin_totals[c.coin],
					rates:[btc_rate],
					volumes:[btc_volume],
				};
			}
		}
		for(i in merged_coins) {
			var m=merged_coins[i];
			m.rate=0;
			for(r in m.rates) {
				if(m.rates[r])
					m.rate+=m.rates[r];
			}
			m.rate/=m.rates.length;

			m.volume=0;
			for(r in m.volumes) {
				if(m.volumes[r])
					m.volume+=m.volumes[r];
			}
		}

		var ts=Date.now();
		var num_coins=0;
		for(i in merged_coins) {
			num_coins++;
			var c=merged_coins[i];

			//console.log("coin "+i+": rate: "+c.rate+" vol: "+c.volume);

			this.data_manager.store_coin(ts,c);
		}
		console.log(num_coins+" coins");
	},
};


//exchanges sources
/*
collector.add_simple_source("MintPal",60,"https://api.mintpal.com/v1/market/summary/",function(c,b) {
	var data=JSON.parse(b);
	for(i in data) {
		var d=data[i];
		c.collect("mintpal",d["code"],d["exchange"],d["last_price"],d["24hvol"]);
	}
});
*/
collector.add_source({
	id:"MintPal",
	interval:60,
	collect:function(c) {
		request( {uri: "https://api.mintpal.com/v1/market/summary/", method:"GET"},
			function(e,r,b) {
				try {
					if(e) {
						console.log("mintpal error: "+e);
						return;
					}
					var data=JSON.parse(b);

					var jobs=new tools.JobQueue();
					jobs.concurrency=10;

					for(i in data) {
						var d=data[i];

						//add coin info
						c.collect("mintpal",d["code"],d["exchange"],d["last_price"],d["24hvol"]);

						//get trades
						(function(market,coin) {
							jobs.add(function(on_end) {
								var uri="https://api.mintpal.com/v1/market/trades/"+coin+"/"+market;
								console.log("Requesting "+uri);
								request({uri:uri,method:"GET"},function(e,r,b) {
									console.log("done");
									on_end();
									try {
										var trade_data=JSON.parse(b).trades;
										var trades=[];
										for(ti in trade_data) {
											var t=trade_data[ti];
											trades.push({
												exchange:"mintpal",
												market:market,
												coin:coin,
												timestamp:t.time,
												price:t.price,
												amount:t.amount,
											});
										}
										trades.sort(function(a,b) { return a.timestamp-b.timestamp; });

										c.collect_trades(trades);
									}
									catch(e) {
										console.log("mintpal error: "+e+" coin "+coin+"/"+market);
									}
								});
							});
						})(d["exchange"],d["code"]);
					}
				}
				catch(e) {
					console.log("mintpal error: "+e);
				}
			});
	}
});

collector.add_simple_source("Bittrex",60,"https://bittrex.com/api/v1/public/getmarketsummaries",function(c,b) {
	var data=JSON.parse(b);
	if(data["success"]!=true) {
		console.log(this.id+" error: success!=true");
		return;
	}
	var coin_data=data["result"];
	for(i in coin_data) {
		var d=coin_data[i];
		var market=d["MarketName"].split("-");
		c.collect("bittrex",market[1],market[0],d["Last"],d["BaseVolume"]);
	}	
});
collector.add_simple_source("vircurex.com",60,"https://api.vircurex.com/api/get_info_for_currency.json",function(c,b) {
	var data=JSON.parse(b);
	for(i in data) {
		var coin=data[i];
		for(ei in coin) {
			var e=coin[ei];
			//console.log("vircurex "+i+"/"+ei+": "+e.last_trade);
			c.collect("vircurex",i,ei,e.last_trade,e.volume);
		}
	}
});
collector.add_simple_source("nxt-e.com",60,"https://www.nxt-e.com/api/stats/GetAllMarkets",function(c,b) {
	var data=JSON.parse(b);
	for(i in data) {
		var d=data[i];
		c.collect("nxt-e",d["Coin"],d["Exchange"],d["CurrentPrice"],d["CoinVol24h"]);
	}
});

/*
collector.add_simple_source("Cryptsy",5*60,"",function(c,b) {
	var data=JSON.parse(b);
	if(data["success"]!=1) {
		console.log(this.id+" error: success!=1");
		return;
	}
	var coin_data=data["return"]["markets"];
	for(i in coin_data) {
		var d=coin_data[i];
		c.collect("cryptsy",d["primarycode"],d["secondarycode"],d["lasttradeprice"],d["volume"]);
	}
});
*/

//blockchain sources
collector.add_simple_source("Blockchain.info",5*60,"https://blockchain.info/q/totalbc",function(c,data) {
	c.collect_total("Blockchain.info","BTC",parseFloat(data)/100000000);
});
collector.add_simple_source("explorer.litecoin.net",5*60,"http://explorer.litecoin.net/chain/Litecoin/q/totalbc",function(c,data) {
	c.collect_total("explorer.litecoin.net","LTC",parseFloat(data));
});
collector.add_simple_source("dogechain.info",5*60,"http://dogechain.info/chain/Dogecoin/q/totalbc",function(c,data) {
	c.collect_total("dogechain.info","DOGE",parseFloat(data));
});
collector.add_source({
	id:"cryptoid.info",
	interval:5*60,
	collect:function(collector) {
		var coins=[
			"AC","ASCE","ATH","AUR","CANN","CFC","CFC2","CRYPT","CSO","DIS","DRK","ENC","FRQ",
			"FLT","GLC","GLYPH","GRS","H5C","HC","JUDGE","KTK","LGC","LOL","MAMM","MUN","NOBL",
			"OC","PC","PIGGY","POT","RIC","RIOT","RBY","ROX","SHA","SHLD","SHOP","SUPER","SYNC",
			"TOR","UNO","VRC","VOOT","XC","XJO"];

		var t=this;
		for(i in coins) {
			(function(coin) {
				request( {uri: "http://chainz.cryptoid.info/"+coin.toLowerCase()+"/api.dws?q=totalcoins", method:"GET"},
					function(e,r,b) {
						try {
							if(e) {
								console.log("error: "+e);
								return;
							}
							collector.collect_total(t.id,coin,parseFloat(b));
						}
						catch(e) {}
					});
			}(coins[i]));
			
		}
	}
});
collector.add_source({
	id:"cryptexplorer.com",
	interval:5*60,
	collect:function(collector) {

		var coins=[
			["AlienCoin","ALN"],
			["AphroditeCoin","APH"],
			["BadgerCoin","BDG"],
			["BeeCoinV2","BEE2"],
			["BlueCoin","BLUE"],
			["Bones","BONE"],
			["CarpeDiemCoin","DIEM"],
			["Coino","CON"],
			["CommunityCoin","COMM"],
			["CryptoEscudo","CESC"],
			["DeleteCoin","DEL"],
			["DigiByte","DGB"],
			["Digit","DIG"],
			["Einsteinium","EMC2"],
			["EmuCoin","EMU"],
			["FractalCoin","FRAC"],
			["FryCoin","FRY"],
			["GoodCoin","GOOD"],
			["GroinCoin","GXG"],
			["GunCoin","GUN"],
			["H2Ocoin","H2O"],
			["HorusCoin","Rx"],
			["HouseOfCoins","HOC"],
			["InformationCoin","ITC"],
			["MaruCoin","MARU"],
			["Megcoin","MEG"],
			["Monocle","MON"],
			["OlympicCoin","OLY"],
			["PiCoin","pi"],
			["PremineCoin","PMC"],
			["ProCoin","PCN"],
			["QuebeCoin","QBC"],
			["ReddCoin","RDD"],
			["RonPaulCoin","RPC"],
			["rotoCoin","Rt2"],
			["SaturnCoin","SAT"],
			["SherlockCoin","SHC"],
			["SiliconValleyCoin","XSV"],
			["Socialcoin","SOC"],
			["SummerCoin","SUM"],
			["SummerCoinV2","SUM2"],
			["TakeOutCoin","TOC"],
			["UniversityCoin","UVC"],
			["Unobtanium","UNO"],
			["Uro","URO"],
			["Vertcoin","VTC"],
			["VirtualMiningCoin","VMC"],
			["WhiteCoin","WC"],
			["WildWestCoin","WEST"],
			["X11Coin","XC"],
			];

		var t=this;
		for(i in coins) {
			(function(coin) {
				request( {uri: "http://cryptexplorer.com//chain/"+coin[0]+"/q/totalbc", method:"GET"},
					function(e,r,b) {
						try {
							if(e) {
								console.log("error: "+e);
								return;
							}
							collector.collect_total(t.id,coin[1],parseFloat(b));
						}
						catch(e) {}
					});
			}(coins[i]));
		}
	}
});




collector.add_simple_source("BitcoinAverage",1*60,"https://api.bitcoinaverage.com/ticker/global/all",function(c,data) {
	var fiats=JSON.parse(data);
	for(i in fiats) {
		var f=fiats[i];
		c.collect_fiat("BitcoinAverage",i,f.last);
	}
});


//start collecting
collector.start();

//collector.data_manager.test();
/*
for(i=0;i<100;i++) {
	var trade={exchange:"mintpal",market:"BTC",coin:"MINT",price:1+1.3*(i%10),amount:20.2+i*0.34,timestamp:""+(10000+i*2.3)};
	collector.collect_trade(trade);
}
*/



