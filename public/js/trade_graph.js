function render_graphs() {


	function myDraw(ctx,serie,data,hover){
		var w=8;
		var xc=serie.xaxis.p2c(data[0]);
		var x1=serie.xaxis.p2c(data[0])-w;
		var x2=serie.xaxis.p2c(data[0])+w;
		var y_low=serie.yaxis.p2c(data[3]);
		var y_high=serie.yaxis.p2c(data[4]);
		var y_open=serie.yaxis.p2c(data[1]);
		var y_close=serie.yaxis.p2c(data[2]);

		ctx.strokeStyle= (data[1]>data[2] ? "red" : "green");
		ctx.fillStyle=ctx.strokeStyle;

		ctx.beginPath();
		ctx.lineWidth=1;
		ctx.moveTo(xc,y_low);
		ctx.lineTo(xc,y_high);
		ctx.stroke();

		if(y_open==y_close) {
			ctx.beginPath();
			ctx.moveTo(x1,y_open);
			ctx.lineTo(x2,y_open);
			ctx.stroke();
		}
		else {
			ctx.beginPath();
			ctx.moveTo(x1,y_open);
			ctx.lineTo(x1,y_close);
			ctx.lineTo(x2,y_close);
			ctx.lineTo(x2,y_open);
			ctx.fill();
		}
	}
	function render(data) {

		var dt=JSON.parse(data);

		for(i in dt) {
			dt[i][0]*=1000;	//sec to ms
		}

		var ts_end=dt[dt.length-1][0]+1000*60*5;
		var ts_start=ts_end-1000*60*60*6;

		var options2={
			canvas: true,
			series: { candlestick: { active: true, drawCandlestick:myDraw } },
			xaxis:  { mode: "time",min: ts_start,max: ts_end },
			grid:   { hoverable: false, clickable: false},
		};
		var data2 = $.plot.candlestick.createCandlestick({
			label:page_data.coin_name,
			data:dt,
			candlestick:{
				show:true,
				lineWidth:"3px" }
		});
		var p1 = $.plot("#graph",data2,options2);

	}



	$.get("/trade_graph/"+page_data.coin_name,render);

}

render_graphs();

