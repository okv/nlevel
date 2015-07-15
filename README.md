# nlevel

nlevel - node.js odm for leveldb.
It is built on top of [levelup](https://github.com/rvagg/node-levelup).
The main ideas are to split db on sections (like collections in mongodb)
and provide additional operations for this sections including manipulations
with set of objects.


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

// put all tasks in a batch
db.tasks.put([{
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
}], function(err) {
	if (err) throw err;

	// NOTICE: in all calls key order matters

	// find task for selected assignee and project (it uses projection 2)
	db.tasks.find({
		start: {assignee: 'jane', project: 'proj 2'}
	}, function(err, tasks) {
		if (err) throw err;
		// prints [ 4 ]
		console.log(tasks.map(function(task) {return task.id;}));
	});

	// find tasks in specific project and version (it uses projection 1)
	db.tasks.find({
		start: {project: 'proj 1', version: '1.0.0'}
	}, function(err, tasks) {
		if (err) throw err;
		// prints [ 1, 2 ]
		console.log(tasks.map(function(task) {return task.id;}));
	});

	// get by full key (it uses projection 1)
	db.tasks.get({
		project: 'proj 1',
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

### ValSection()

  Value section constructor accepts `db`, `name` and returns instance of section

### ValSection.put(value:Any, [callback(err)]:Function)

  Put value to section accepts

### ValSection.get(callback(err,value):Function)

  Get value from section

### ValSection.del([callback(err)]:Function)

  Delete value from section

### DocsSection()

  Documents section stores objects in different projections. Constructor
  accepts `db`, `name` of section and `options`, `options.projections` is a
  list of target projections in which documents will be stored.
  Each projection defines `key` by which document will be accessible and
  `value` which is the presentation of document for projection. `key` is an
  object of field names and values for them. If value of key field is a
  function object will be passed to it and it should return string key
  otherwise value for this key from object will be get. If `value` is a
  function it will accept object and should return new object which will be
  stored for this projection. Any document should have an unique identifier - 
  `id` field. Projection keys stores in alphabetical order and you can easily
  find documents (their presentations) between [start..end] (see `find` method
  api). Each document will have one key for each projection because of that
  you usually should put `id` field as last for projection. Field order at
  `key` object (and at `find`) matters.

### DocsSection.put(docs:Object|Object[], [callback(err)]:Function)

  Put one or array of documents to the section

### DocsSection.find(params:Object, [callback(err,docs)]:Function)

  Find documents
  
  - `params.by` - id of projection to use, by default it detects projection
  using condition (start, end)
  - `params.start` - start key
  - `params.end` - end key, by default it equals to `params.start` (with added
  boundary symbol)
  - `params.reverse` - a boolean, set to true if you want to go in reverse order
  - `params.filter` - function(value) if it returns falsy value document will be
  excluded from result
  - `params.offset` - integer, skip selected documents count
  - `params.limit` - limit count of documents in result
  - `params.usingValues` - (false by default) optimization flag, which can be
  set to force of using `values` for some operations which uses `keys` by default
  (e.g. counting)

### DocsSection.count(findParams:Object, [callback(err,documentsCount)]:Function)

  Count documents using `findParams` (see `find`).
  Notice: It counts keys (or values) internally (can take long time e.g. on
  large dataset)

### DocsSection.get(key:Object, [projectionId]:String, [callback(err,doc)]:Function)

  Get document by full key

### DocsSection.update(key:Object, modifier:Object|Function, [callback(err)]:Function)

  Update document by `key` using `modifier` which could object of fields and
  values to be updated or function which accepts document and returns modified
  document

### DocsSection.multiUpdate(findParams:Object, modifier:Object|Function, [callback(err,updatedCount)]:Function)

  Find documents using `findParams` (see `find`) and update them using
  `modifier` (see `modifier` description at `update`). Count of updated
  documents will be passed to `callback` (it could be zero).
  document

### DocsSection.del(ids:String[]|Object[], [callback(err)]:Function)

  Delete documents by array of their ids or array of objects with `id` field


## Run tests

into cloned repository run

```
npm test
```
