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

var taskProjs = [
	{key: {id: 1}},
	{key: {project: 1, version: 1, assignee: 1, id: 1}},
	{key: {assignee: 1, project: 1, version: 1, id: 1}},
	{key: {assignee: 1, project: 1, version: 1, id: 1}, value: function(doc) {
		return {id: doc.id};
	}, id: 'assignee-project-version-id-returns-id'},
	{key: {done: function(doc) {
		return Number(doc.done);
	}, assignee: 1, id: 1}}
];

lib.DocsSection.prototype._calcProjectionIds.call({projections: taskProjs});

function getTasks(projection, params, outFields) {
	var context = {
		name: 'name',
		separator: '~',
		projections: taskProjs,
		_determineProjection: lib.DocsSection.prototype._determineProjection
	};

	function getStrKey() {
		return lib.DocsSection.prototype._getStrKey.apply(context, arguments);
	}

	function getProjKey() {
		return lib.DocsSection.prototype._getProjKey.apply(context, arguments);
	}

	var sortIndexHash = {};
	var newTasks = tasks.map(function(task) {
		return getProjKey(task, projection);
	}).sort().map(function(sortIndex) {
		return tasks.filter(function(task) {
			return getProjKey(task, projection) === sortIndex;
		})[0];
	});
	var start = getStrKey(params.start, projection.id);
	var end = params.end ? getStrKey(params.end, projection.id) : start;
	end += lib.DocsSection.prototype.end;
	newTasks = newTasks.filter(function(task) {
		var sortIndex = getProjKey(task, projection);
		return sortIndex >= start && sortIndex <= end;
	});
	if (outFields) newTasks = newTasks.map(function(task) {
		var newTask = {};
		outFields.forEach(function(field) {
			newTask[field] = task[field];
		});
		return newTask;
	});
	return newTasks;
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
	var tasksSection = null;

	it('created without errors', function(done) {
		tasksSection = new lib.DocsSection(db, 'tasks', {
			projections: taskProjs.slice(1)
		});
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

	it('found value by start', function(done) {
		var params = {start: {project: 'proj 2'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});

	it('found value by start using another projection', function(done) {
		var params = {start: {assignee: 'jane'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[2], params));
			done();
		});
	});

	it('found value by selected projection which returns only ids', function(done) {
		var params = {
			by: 'assignee-project-version-id-returns-id',
			start: {assignee: 'jane'}
		};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[3], params, ['id']));
			done();
		});
	});

	it('found value by start (with 2 field)', function(done) {
		var params = {start: {project: 'proj 3', version: '0.1'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[1], params));
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
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});

	it('found value by start and end with filter', function(done) {
		var params = {
			start: {project: 'proj 1'},
			end: {project: 'proj 2'},
			filter: function(doc) {
				return doc.project === 'proj 1';
			}
		};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[1], {start: params.start}));
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
			expect(data).eql(getTasks(taskProjs[1], params));
			done();
		});
	});

	it('found value with key which contains function', function(done) {
		var params = {start: {done: 0}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			expect(data).eql(getTasks(taskProjs[4], params));
			done();
		});
	});

	it('without condition found all', function(done) {
		tasksSection.find({}, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(getTasks(taskProjs[0], {start: {id: ''}}));
			done();
		});
	});

	it('update document (put existsing one) without errors', function(done) {
		var task = tasks[tasks.length - 1];
		task.project = 'proj 1';
		tasksSection.put(task, function(err) {
			if (err) {done(err); return;}
			done();
		});
	});

	it('update document (with update and object) without errors', function(done) {
		var task = tasks[tasks.length - 1],
			assignee = 'jane';
		task.assignee = assignee;
		tasksSection.update({id: task.id}, {assignee: assignee}, function(err) {
			if (err) {done(err); return;}
			tasksSection.get({id: task.id}, function(err, doc) {
				if (err) {done(err); return;}
				expect(doc).eql(task);
				done();
			});
		});
	});

	it('update document (with update and function) without errors', function(done) {
		var task = tasks[tasks.length - 1],
			version = '0.3';
		task.version = version;
		tasksSection.update({id: task.id}, function(doc) {
			doc.version = version;
			return doc;
		}, function(err) {
			if (err) {done(err); return;}
			tasksSection.get({id: task.id}, function(err, doc) {
				if (err) {done(err); return;}
				expect(doc).eql(task);
				done();
			});
		});
	});

	it('update documents using multi update without errors', function(done) {
		var task1 = tasks[0],
			task2 = tasks[1],
			version = '0.44',
			findParams = {filter: function(doc) {
				return doc.id === task1.id || doc.id === task2.id;
			}};
		task1.version = version;
		task2.version = version;
		tasksSection.multiUpdate(findParams, function(doc) {
			doc.version = version;
			return doc;
		}, function(err, updatedCount) {
			if (err) {done(err); return;}
			expect(updatedCount).equal(2);
			tasksSection.find(findParams, function(err, docs) {
				if (err) {done(err); return;}
				expect(docs).eql([task1, task2]);
				done();
			});
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
			expect(data).eql(getTasks(taskProjs[1], params));
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
			expect(data).eql(getTasks(taskProjs[2], params));
			done();
		});
	});

	it('delete', function(done) {
		var params = {start: {project: 'proj 2'}};
		tasksSection.find(params, function(err, data) {
			if (err) {done(err); return;}
			expect(data.length).greaterThan(0);
			tasksSection.del(data, function() {
				getTasks(taskProjs[1], params).forEach(function(task) {
					for (var i = 0; i < tasks.length; i++) {
						if (task.id == tasks[i].id) {
							tasks.splice(i, 1);
							break;
						}
					}
				});
				tasksSection.find({}, function(err, data) {
					if (err) {done(err); return;}
					expect(data).eql(getTasks(taskProjs[0], {start: {id: ''}}));
					done();
				});
			});
		});
	});
});
