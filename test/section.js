'use strict';

var expect = require('expect.js'),
	fs = require('fs'),
	lib = require('../lib');


var dbPath = './testdb',
	db = null;

describe('bootstrap', function() {
	it('remove previous and create new test db', function(done) {
		if (fs.existsSync(dbPath)) {
			lib.db.destroy(dbPath, createDb);
		} else {
			createDb();
		}
		function createDb(err) {
			if (err) {done(err); return;}
			db = lib.db(dbPath, {
				valueEncoding: 'json'
			});
			done();
		}
	});
});

var tasks = [{
	id: 1, project: 'proj 1', version: '1.0.0', assignee: 'bob', done: true
}, {
	id: 2, project: 'proj 1', version: '1.0.0', assignee: 'jane', done: false
}, {
	id: 3, project: 'proj 2', version: '2.0', assignee: 'bob', done: true
}, {
	id: 4, project: 'proj 2', version: '2.0', assignee: 'jane', done: true
}, {
	id: 5, project: 'proj 3', version: '0.1', assignee: 'sam', done: true
}, {
	id: 6, project: 'proj 3', version: '0.2', assignee: 'sam', done: false
}];

function getTasks(projection, params) {
	var sortIndexHash = {};
	var newTasks = tasks.map(function(task) {
		return getProjKey(task, projection);
	}).sort().map(function(sortIndex) {
		return tasks.filter(function(task) {
			return getProjKey(task, projection) === sortIndex;
		})[0];
	});
	var start = getStrKey(params.start);
	var end = params.end ? getStrKey(params.end) : start;
	end += lib.DocsSection.prototype.end;
	newTasks = newTasks.filter(function(task) {
		var sortIndex = getProjKey(task, projection);
		return sortIndex >= start && sortIndex <= end;
	});
	return newTasks;
}

function getProjKey() {
	return lib.DocsSection.prototype._getProjKey.apply(
		{name: 'name', separator: '~'}, arguments
	);
}

function getStrKey() {
	return lib.DocsSection.prototype._getStrKey.apply(
		{name: 'name', separator: '~'}, arguments
	);
}

describe('single value section', function() {
	var tasksSection = null;

	it('will not be created without db or name', function(done) {
		expect(function() {
			tasksSection = new lib.ValSection();
		}).throwError('`db` for batch is not set');
		expect(function() {
			tasksSection = new lib.ValSection(db);
		}).throwError('`name` for batch is not set');
		done();
	});

	it('created without errors', function(done) {
		tasksSection = new lib.ValSection(db, 'tasks');
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
			{key: {project: 1, version: 1, assignee: 1, id: 1}},
			{key: {assignee: 1, project: 1, version: 1, id: 1}},
			{key: {done: function(doc) {
				return Number(doc.done);
			}, assignee: 1, id: 1}}
		];

	it('created without errors', function(done) {
		tasksSection = new lib.DocsSection(db, 'tasks', {projections: taskProjs});
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
		var params = {start: {project: 'proj 2'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('found value by start (with 1 field) using 2 projection', function(done) {
		var params = {start: {assignee: 'jane'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});

	it('found value by start (with 2 field)', function(done) {
		var params = {start: {project: 'proj 3', version: '0.1'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('found value by start and end  (with 1 field)', function(done) {
		var params = {
			start: {project: 'proj 1'},
			end: {project: 'proj 2'}
		};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('found value by start and end (with 2 field)', function(done) {
		var params = {
			start: {project: 'proj 3', version: '0.1'},
			end: {project: 'proj 3', version: '0.2'}
		};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('found value with key which contains function', function(done) {
		var params = {start: {done: 0}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[2], params));
			done();
		});
	});

	it('without condition found all', function(done) {
		tasksSection.find({start: {id: ''}}, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks({key: {id: 1}}, {start: {id: ''}}));
			done();
		});
	});

	it('update document (put existsing one) without errors', function(done) {
		var task = tasks.pop();
		task.project = 'proj 1';
		tasks.splice(0, 0, task);
		tasksSection.put(task, function(err, data) {
			if (err) {done(err); return;}
			done();
		});
	});

	it('check that docs updated via 1 projection', function(done) {
		var params = {
			start: {project: 'proj 1'},
			end: {project: 'proj 3'}
		};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[0], params));
			done();
		});
	});

	it('check that docs updated via 2 projection', function(done) {
		var params = {
			start: {assignee: 'sam', project: 'proj 1'},
			end: {assignee: 'sam', project: 'proj 3'}
		};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});

	it('delete', function(done) {
		var params = {start: {project: 'proj 2'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			tasksSection.del(data, function() {
				getTasks(taskProjs[0], params).forEach(function(task) {
					for (var i = 0; i < tasks.length; i++) {
						if (task.id == tasks[i].id) {
							tasks.splice(i, 1);
							break;
						}
					}
				});
				tasksSection.find({}, function(err, data) {
					if (err) {done(err); return;}
					expect(data).eql(getTasks({key: {id: 1}}, {start: {id: ''}}));
					done();
				});
			});
		});
	});
});
