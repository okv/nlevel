'use strict';

var expect = require('expect.js'),
	levelup = require('level'),
	fs = require('fs'),
	Batch = require('../lib').Batch;


var dbPath = './testdb',
	db = null;

describe('bootstrap', function() {
	it('remove previous and create new test db', function(done) {
		if (fs.existsSync(dbPath)) {
			levelup.destroy(dbPath, createDb);
		} else {
			createDb();
		}
		function createDb(err) {
			if (err) {done(err); return;}
			db = levelup(dbPath, {
				keyEncoding: 'json',
				valueEncoding: 'json'
			});
			done();
		}
	});
});

var tasks = [{
	id: 1,
	title: 'Task 1 at project 1',
	project: 'project 1',
	version: '1.0.0',
	assignee: 'bob'
}, {
	id: 2,
	title: 'Task 2 at project 1',
	project: 'project 1',
	version: '1.0.0',
	assignee: 'jane'
}, {
	id: 3,
	title: 'Task 1 at project 2',
	project: 'project 2',
	version: '2.0',
	assignee: 'bob'
}, {
	id: 4,
	title: 'Task 2 at project 2',
	project: 'project 2',
	version: '2.0',
	assignee: 'jane'
}, {
	id: 5,
	title: 'Task 1 at project 3',
	project: 'project 3',
	version: '0.1',
	assignee: 'sam'
}, {
	id: 6,
	title: 'Task 2 at project 3',
	project: 'project 3',
	version: '0.2',
	assignee: 'sam'
}];

function getTasks(projection, params) {
	var sortIndexHash = {};
	var newTasks = tasks.map(function(task) {
		return getProjKey(task, projection);
	}).sort().map(function(sortIndex) {
		return tasks.filter(function(task) {
			return getProjKey(task, projection) == sortIndex;
		})[0];
	});
	params.start = getStrKey(params.start);
	params.end = params.end ? getStrKey(params.end) : params.start;
	params.end += Batch.prototype.end;
	newTasks = tasks.filter(function(task) {
		var sortIndex = getProjKey(task, projection);
		return sortIndex >= params.start && sortIndex <= params.end;
	});
	return newTasks;
}

function getProjKey() {
	return Batch.prototype._getProjKey.apply(
		{prefix: 'prefix', separator: '~'}, arguments
	);
}

function getStrKey() {
	return Batch.prototype._getStrKey.apply(
		{prefix: 'prefix', separator: '~'}, arguments
	);
}

describe('simple batch (without projections)', function() {
	var tasksBatch = null;

	it('will no be created without db or prefix', function(done) {
		expect(function() {
			tasksBatch = new Batch();
		}).throwError('`db` for batch is not set');
		expect(function() {
			tasksBatch = new Batch(db);
		}).throwError('`prefix` for batch is not set');
		done();
	});

	it('created without errors', function(done) {
		tasksBatch = new Batch(db, 'tasks');
		done();
	});

	it('put key and value without errors', function(done) {
		tasksBatch.put(tasks, done);
	});

	it('got value by key', function(done) {
		tasksBatch.get(function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(tasks);
			done();
		});
	});

	it('del by key', function(done) {
		tasksBatch.del(done);
	});

	it('get by key returns NotFound error', function(done) {
		tasksBatch.get(function(err) {
			expect(err).have.property(
				'message', 'Key not found in database [tasks]'
			);
			done();
		});
	});
});

describe('batch with projections', function() {
	var tasksBatch = null,
		taskProjs = [
			['project', 'version', 'assignee', 'id'],
			['assignee', 'project', 'version', 'id']
		];

	it('created without errors', function(done) {
		tasksBatch = new Batch(db, 'tasks', {projections: taskProjs});
		done();
	});

	it('put key and value without errors', function(done) {
		var putCount = 0;
		tasks.forEach(function(task) {
			tasksBatch.put(task, function() {
				putCount++;
				if (putCount == tasks.length) done();
			});
		});
	});

	it('found value by start (with 1 field)', function(done) {
		var params = {start: {project: 'project 2'}};
		tasksBatch.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('found value by start (with 1 field) using 2 projection', function(done) {
		var params = {start: {assignee: 'jane'}};
		tasksBatch.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});

	it('found value by start (with 2 field)', function(done) {
		var params = {start: {project: 'project 3', version: '0.1'}};
		tasksBatch.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('found value by start and end  (with 1 field)', function(done) {
		var params = {
			start: {project: 'project 1'},
			end: {project: 'project 2'}
		};
		tasksBatch.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('found value by start and end (with 2 field)', function(done) {
		var params = {
			start: {project: 'project 3', version: '0.1'},
			end: {project: 'project 3', version: '0.2'}
		};
		tasksBatch.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('update document (put existsing one) without errors', function(done) {
		var task = tasks.pop();
		task.project = 'project 1';
		tasks.splice(0, 0, task);
		tasksBatch.put(task, function(err, data) {
			if (err) {done(err); return;}
			done();
		});
	});

	it('check that docs updated via 1 projection', function(done) {
		var params = {
			start: {project: 'project 1'},
			end: {project: 'project 3'}
		};
		tasksBatch.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('check that docs updated via 2 projection', function(done) {
		var params = {
			start: {assignee: 'sam', project: 'project 1'},
			end: {assignee: 'sam', project: 'project 3'}
		};
		tasksBatch.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});
});
