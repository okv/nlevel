'use strict';

var expect = require('expect.js'),
	levelup = require('level'),
	fs = require('fs'),
	ValSection = require('../lib').ValSection,
	DocsSection = require('../lib').DocsSection;


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
	params.end += DocsSection.prototype.end;
	newTasks = tasks.filter(function(task) {
		var sortIndex = getProjKey(task, projection);
		return sortIndex >= params.start && sortIndex <= params.end;
	});
	return newTasks;
}

function getProjKey() {
	return DocsSection.prototype._getProjKey.apply(
		{name: 'name', separator: '~'}, arguments
	);
}

function getStrKey() {
	return DocsSection.prototype._getStrKey.apply(
		{name: 'name', separator: '~'}, arguments
	);
}

describe('single value section', function() {
	var tasksSection = null;

	it('will not be created without db or name', function(done) {
		expect(function() {
			tasksSection = new ValSection();
		}).throwError('`db` for batch is not set');
		expect(function() {
			tasksSection = new ValSection(db);
		}).throwError('`name` for batch is not set');
		done();
	});

	it('created without errors', function(done) {
		tasksSection = new ValSection(db, 'tasks');
		done();
	});

	it('put key and value without errors', function(done) {
		tasksSection.put(tasks, done);
	});

	it('got value by key', function(done) {
		tasksSection.get(function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(tasks);
			done();
		});
	});

	it('del by key', function(done) {
		tasksSection.del(done);
	});

	it('get by key returns NotFound error', function(done) {
		tasksSection.get(function(err) {
			expect(err).have.property(
				'message', 'Key not found in database [tasks]'
			);
			done();
		});
	});
});

describe('documents section', function() {
	var tasksSection = null,
		taskProjs = [
			['project', 'version', 'assignee', 'id'],
			['assignee', 'project', 'version', 'id']
		];

	it('created without errors', function(done) {
		tasksSection = new DocsSection(db, 'tasks', {projections: taskProjs});
		done();
	});

	it('doesn`t allow put document without id', function(done) {
		tasksSection.put(
			[tasks[0], {user: 'user'}].concat(tasks.slice(1)),
			function(err) {
				expect(err.message).equal(
					'Document doesn`t have `id`: {"user":"user"}'
				);
				done();
			}
		);
	});

	it('doesn`t allow put non document value', function(done) {
		tasksSection.put(
			[tasks[0], 1].concat(tasks.slice(1)),
			function(err) {
				expect(err.message).equal('Document should be an `object`: 1');
				done();
			}
		);
	});

	it('put single doc without errors', function(done) {
		tasksSection.put(tasks[0], done);
	});

	it('put docs in batch without errors', function(done) {
		tasksSection.put(tasks.slice(1), done);
	});

	it('found value by start (with 1 field)', function(done) {
		var params = {start: {project: 'project 2'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('found value by start (with 1 field) using 2 projection', function(done) {
		var params = {start: {assignee: 'jane'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});

	it('found value by start (with 2 field)', function(done) {
		var params = {start: {project: 'project 3', version: '0.1'}};
		tasksSection.find(params, function(err, data) {
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
		tasksSection.find(params, function(err, data) {
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
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('update document (put existsing one) without errors', function(done) {
		var task = tasks.pop();
		task.project = 'project 1';
		tasks.splice(0, 0, task);
		tasksSection.put(task, function(err, data) {
			if (err) {done(err); return;}
			done();
		});
	});

	it('check that docs updated via 1 projection', function(done) {
		var params = {
			start: {project: 'project 1'},
			end: {project: 'project 3'}
		};
		tasksSection.find(params, function(err, data) {
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
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});
});
