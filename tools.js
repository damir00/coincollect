var Timer=function(func,interval) {
	var t=this;
	this.tick=function() {
		func();
		setTimeout(t.tick,interval);
	}
	this.start=function() {
		this.tick();
	}
};

var JobQueue=function() {
	var running_jobs=0;
	var jobs=[];
	var concurrency=1;

	function start_jobs() {

		while(running_jobs<concurrency) {
			if(jobs.length==0) {
				return;
			}

			running_jobs++;
			var j=jobs.shift();
			j(function() {
				running_jobs--;
				start_jobs();
			});
		}
	}

	this.add=function(job) {
		jobs.push(job);
		start_jobs();
	}
	this.length=function() {
		return jobs.length+running_jobs;
	}

	this.test=function() {
		concurrency=3;
		var t=this;
		for(i=0;i<10;i++) {
			(function(c) {
				t.add(function(on_end) {
					console.log("task "+c+" start");
					setTimeout(function() { 
						console.log("task "+c+" done");
						on_end();
					},1000);
				});
			})(i);
		}
	}
};

module.exports={
	Timer:Timer,
	JobQueue:JobQueue,
};

