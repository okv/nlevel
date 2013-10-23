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
	var tasksBatch = null;

	it('created without errors', function(done) {
		tasksBatch = new Batch(db, 'tasks', {
			projections: [
				['project', 'version', 'assignee', 'id'],
				['assignee', 'project', 'version', 'id']
			]
		});
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
		tasksBatch.find({
			start: {project: 'project 2'}
		}, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(tasks.slice(2, 4));
			done();
		});
	});

	it('found value by start (with 1 field) using 2 projection', function(done) {
		tasksBatch.find({
			start: {assignee: 'jane'}
		}, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql([tasks[1], tasks[3]]);
			done();
		});
	});

	it('found value by start (with 2 field)', function(done) {
		tasksBatch.find({
			start: {project: 'project 3', version: '0.1'}
		}, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(tasks.slice(4, 5));
			done();
		});
	});

	it('found value by start and end  (with 1 field)', function(done) {
		tasksBatch.find({
			start: {project: 'project 1'},
			end: {project: 'project 2'}
		}, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(tasks.slice(0, 4));
			done();
		});
	});

	it('found value by start and end (with 2 field)', function(done) {
		tasksBatch.find({
			start: {project: 'project 3', version: '0.1'},
			end: {project: 'project 3', version: '0.2'}
		}, function(err, data) {
			if (err) {done(err); return;}
			expect(data).eql(tasks.slice(4, 6));
			done();
		});
	});

});
