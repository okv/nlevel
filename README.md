# nlevel

nlevel - node.js odm for leveldb.
It is built on top of [levelup](https://github.com/rvagg/node-levelup).
The main ideas are to split db on sections (like collections in mongodb)
and provide additional operations for this sections including manipulation with
sets of objects.


## Installation

```
npm install nlevel
```


## Usage

```js

var nlevel = require('nlevel');

// create db
var ldb = nlevel.db('./mydb', {valueEncoding: 'json'});

// store all sections in one object for convenience
var db = {};

// create value section which associate name with arbitrary value
db.cities = new nlevel.ValSection(ldb, 'cities');

db.cities.put(['Elina', 'Dillon', 'Saundra', 'Harmony'], function(err) {
	db.cities.get(function(err, cities) {
		if (err) throw err;
		// prints our array: [ 'Elina', 'Dillon', 'Saundra', 'Harmony' ]
		console.log(cities);
	});
});


// create documents section with projections (key order matters)
db.tasks = new nlevel.DocsSection(ldb, 'tasks', {
	projections: [
		// projection 1
		{key: {project: 1, version: 1, assignee: 1, id: 1}},
		// projection 2
		{key: {assignee: 1, project: 1, version: 1, id: 1}}
	]
});

// put all task in a batch
db.tasks.put([{
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
}], function(err) {
	if (err) throw err;

	// NOTICE: in all calls key order matters

	// find task for selected assignee and project (it uses projection 2)
	db.tasks.find({
		start: {assignee: 'jane', project: 'project 2'}
	}, function(err, tasks) {
		if (err) throw err;
		// prints [ 4 ]
		console.log(tasks.map(function(task) {return task.id;}));
	});
	// find tasks in specific project and version (it uses projection 1)
	db.tasks.find({
		start: {project: 'project 1', version: '1.0.0'}
	}, function(err, tasks) {
		if (err) throw err;
		// prints [ 1, 2 ]
		console.log(tasks.map(function(task) {return task.id;}));
	});
	// get by full key (it uses projection 1)
	db.tasks.get({
		project: 'project 1',
		version: '1.0.0',
		assignee: 'bob',
		id: 1
	}, function(err, task) {
		if (err) throw err;
		// prints 1
		console.log(task.id);
	});
});

```


## Sections api

coming soon...
