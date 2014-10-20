function render_graphs() {

	//var ctx = $("#chart").get(0).getContext("2d");

	function plot_graphs(elements,index) {
		if(index>=elements.length) return;
		var el=elements.eq(index);

		var coin=el.parent().parent().data("coin");

		$.get("/price_graph/"+coin,function(response) {

			plot_graphs(elements,index+1);

			if(!response) return;

			var graph_data=JSON.parse(response);
			var data = [ { data: graph_data } ];

			var options = {
				canvas: true,
				xaxes: [ { mode: "time" } ],
				yaxes: [ { }, {
					position: "right",
					alignTicksWithAxis: 1,
					tickFormatter: function(value, axis) {
						return value.toFixed(axis.tickDecimals) + "€";
					}
				} ],
				legend: { position: "sw" }
			}

			$(el).plot(data,options);

		});
	}


	//var charts=$(".chart");
	plot_graphs($(".chart"),0);
	return;	

	$.get("/price_graph",function(response) {
		if(!response) return;

		var graph_data=JSON.parse(response);

		/*
		var data = {
		    labels: ["hello","","","","","foo","bar"], //graph_data.x,
		    datasets: [{
			    label: "My First dataset",
			    fillColor: "rgba(220,220,220,0.2)",
			    strokeColor: "rgba(220,220,220,1)",
			    pointColor: "rgba(220,220,220,1)",
			    pointStrokeColor: "#fff",
			    pointHighlightFill: "#fff",
			    pointHighlightStroke: "rgba(220,220,220,1)",
			    data: graph_data.y
			}]
		};

		var opts={
			bezierCurve: false,
			pointDot : false,
			datasetFill : false,
			scaleShowGridLines : true,
		};

		var myNewChart = new Chart(ctx).Line(data,opts);
		*/

		
		var data = [
			{ data: graph_data }
		];

		

		var options = {
			canvas: true,
			xaxes: [ { mode: "time" } ],
			yaxes: [ { }, {
				position: "right",
				alignTicksWithAxis: 1,
				tickFormatter: function(value, axis) {
					return value.toFixed(axis.tickDecimals) + "€";
				}
			} ],
			legend: { position: "sw" }
		}


		


		//$(".chart")[0].plot(data,options);

		/*
		$(".chart").each(function(index,element) {
			//$(element).html(index);
			$(element).plot(data,options);
		});
		*/
		/*
		for(i in divs) {
			//$(divs[1]).plot(data, options);
			$(divs[i]).html(i);
		}
		*/

	});
}

render_graphs();
