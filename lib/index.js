'use strict';

var inherits = require('util').inherits;


function BaseSection(db, name) {
	this.db = db;
	if (!db) throw new Error('`db` for batch is not set');
	if (!name) throw new Error('`name` for batch is not set');
	this.name = name;
}

BaseSection.prototype.separator = '~';
BaseSection.prototype.end = '\xff';


/**
 * Value section constructor accepts `db`, `name` and returns instance of section
 */
function ValSection(db, name) {
	BaseSection.call(this, db, name);
}

inherits(ValSection, BaseSection);

/**
 * Put value to section accepts
 * @param {Any} value
 * @param {Function} [callback(err)]
 */
ValSection.prototype.put = function(value, callback) {
	this.db.put(this.name, value, callback);
};

/**
 * Get value from section
 * @param {Function} callback(err,value)
 */
ValSection.prototype.get = function(callback) {
	this.db.get(this.name, callback);
};

/**
 * Delete value from section
 * @param {Function} [callback(err)]
 */
ValSection.prototype.del = function(callback) {
	this.db.del(this.name, callback);
};


/**
 * Documents section stores objects in different projections. Constructor
 * accepts `db`, `name` of section and `options`, `options.projections` is a
 * list of target projections in which documents will be stored.
 * Each projection defines `key` by which document will be accessible and
 * `value` which is the presentation of document for projection. `key` is an
 * object of field names and values for them. If value of key field is a
 * function object will be passed to it and it should return string key
 * otherwise value for this key from object will be get. If `value` is a
 * function it will accept object and should return new object which will be
 * stored for this projection. Any document should have an unique identifier - 
 * `id` field. Projection keys stores in alphabetical order and you can easily
 * find documents (their presentations) between [start..end] (see `find` method
 * api). Each document will have one key for each projection because of that
 * you usually should put `id` field as last for projection. Field order at
 * `key` object (and at `find`) matters.
 */
function DocsSection(db, name, options) {
	BaseSection.call(this, db, name);
	options = options || {};
	this.projections = [{key: {id: 1}}].concat(options.projections || []);
	this._calcProjectionIds();
}

inherits(DocsSection, BaseSection);

DocsSection.prototype._calcProjectionIds = function() {
	var projectionIds = {};
	this.projections.forEach(function(projection) {
		var id = projection.id;
		if (!id) id = Object.keys(projection.key).map(function(key) {
			return key;
		}).join('-');
		if (id in projectionIds) throw new Error('Duplicate projection id: ' + id);
		projectionIds[id] = 1;
		projection.id = id;
	});
};

/**
 * Put one or array of documents to the section
 * @param {Object|Object[]} docs
 * @param {Function} [callback(err)]
 */
DocsSection.prototype.put = function(docs, callback) {
	var self = this;
	if (!Array.isArray(docs)) docs = [docs];

	if (docs.length === 0) {callback(new Error('Nothing to put')); return;}

	var err = this._validateDocs(docs);
	if (err) {callback(err); return;}

	var docsReady = 0,
		operations = [];

	docs.forEach(function(doc) {
		self.get({id: doc.id}, function(err, oldDoc) {
			// TODO: check exactly for NotFound error
			self.projections.forEach(function(projection) {
				var projKey = self._getProjKey(doc, projection);
				if (oldDoc) {
					var oldProjKey = self._getProjKey(oldDoc, projection);
					if (projKey !== oldProjKey) operations.push({
						type: 'del',
						key: oldProjKey
					});
				}
				operations.push({
					type: 'put',
					key: projKey,
					value: self._getProjValue(doc, projection)
				});
			});
			docsReady++;
			// exec batch after all operations was generated
			if (docsReady === docs.length) self.db.batch(operations, callback);
		});
	});
};

DocsSection.prototype._validateDocs = function(docs) {
	if (!Array.isArray(docs)) docs = [docs];
	for (var i = 0; i < docs.length; i++) {
		var doc = docs[i];
		var err = null;
		if (typeof doc !== 'object') {
			err = new Error(
				'Document should be an `object`: ' + JSON.stringify(doc)
			);
		} else if ('id' in doc === false) {
			err = new Error('Document doesn`t have `id`: ' + JSON.stringify(doc));
		}
		if (err) return err;
	}
};

DocsSection.prototype._getProjKey = function(doc, projection) {
	var projKey = [this.name, projection.id];
	for (var key in projection.key) {
		var value = null;
		if (typeof projection.key[key] === 'function') {
			value = projection.key[key](doc);
		} else {
			value = doc[key];
		}
		projKey.push(key + ':' + value);
	}
	return projKey.join(this.separator);
}

DocsSection.prototype._getProjValue = function(doc, projection) {
	var value = doc;
	if (projection.value && typeof projection.value === 'function') {
		value = projection.value(doc);
	}
	return value;
}

/**
 * Find documents
 *
 * - `params.by` - id of projection to use, by default it detects projection
 * using condition (start, end)
 * - `params.start` - start key
 * - `params.end` - end key, by default it equals to `params.start` (with added
 * boundary symbol)
 * - `params.reverse` - a boolean, set to true if you want to go in reverse order
 * - `params.filter` - function(value) if it returns falsy value document will be
 * excluded from result
 * @param {Object} params
 * @param {Function} [callback(err,docs)]
 */
DocsSection.prototype.find = function(params, callback) {
	// clone params to prevent side effects
	params = extend({}, params);
	callback = callback || noop;
	var self = this;
	if (!params.start && params.end) {
		callback(new Error('`end` selected without `start`'));
		return;
	}
	// using `id` projection for finding all
	if (!params.start) params.start = {id: ''};
	var projectionId = params.by || self._determineProjection(params.start);
	params.start = self._getStrKey(params.start, projectionId);
	params.end = params.end ? self._getStrKey(params.end, projectionId) : params.start;
	// add end character
	params.end += self.end;
	// swap `start` `end` conditions when reverse is set
	if (params.reverse) {
		var tmp = params.start;
		params.start = params.end;
		params.end = tmp;
	}
	params.keys = 'keys' in params ? params.keys : false;
	params.values = 'values' in params ? params.values : true;

	var result = [];

	var dataIter = null;
	if (params.filter) {
		dataIter = function(data) {
			if (params.filter(data)) result.push(data);
		};
	} else {
		dataIter = function(data) {
			result.push(data);
		};
	}

	self.db.createReadStream(params)
		.on('data', dataIter)
		.on('end', function() {
			callback(null, result);
		}).on('error', callback);
};

// determine which projection we will use for find with `objKey`
DocsSection.prototype._determineProjection = function(objKey) {
	var projectionId = null;
	var strKey = Object.keys(objKey).map(function(key) {
		return key;
	}).join('-');
	for (var i = 0; i < this.projections.length; i++) {
		if (this.projections[i].id.indexOf(strKey) === 0) {
			projectionId = this.projections[i].id;
			break;
		}
	}
	if (!projectionId) throw new Error(
		'Can`t find projection for key: ' + JSON.stringify(objKey)
	);
	return projectionId;
};

DocsSection.prototype._getStrKey = function(objKey, projectionId) {
	if (!projectionId) projectionId = this._determineProjection(objKey);
	var strKey = [this.name, projectionId];
	for (var key in objKey) {
		strKey.push(key + ':' + objKey[key]);
	}
	return strKey.join(this.separator);
}

/**
 * Get document by full key
 * @param {Object} key
 * @param {String} [projectionId]
 * @param {Function} [callback(err,doc)]
 */
DocsSection.prototype.get = function(key, projectionId, callback) {
	if (typeof projectionId === 'function') {
		callback = projectionId;
		projectionId = null;
	}
	this.db.get(this._getStrKey(key, projectionId), callback);
};

/**
 * Update document by `key` using `modifier` which could object of fields and
 * values to be updated or function which accepts document and returns modified
 * document
 * @param {Object} key
 * @param {Object|Function} modifier
 * @param {Function} [callback(err)]
 */
DocsSection.prototype.update = function(key, modifier, callback) {
	var self = this;
	self.get(key, function(err, doc) {
		err = err || self._checkUpdateModifier(modifier);
		if (err) {callback(err); return;}
		self.put(self._updateDoc(doc, modifier), callback);
	});
};

/**
 * Find documents using `findParams` (see `find`) and update them using
 * `modifier` (see `modifier` description at `update`). Count of updated
 * documents will be passed to `callback` (it could be zero).
 * document
 * @param {Object} findParams
 * @param {Object|Function} modifier
 * @param {Function} [callback(err,updatedCount)]
 */
DocsSection.prototype.multiUpdate = function(findParams, modifier, callback) {
	var self = this;
	self.find(findParams, function(err, docs) {
		err = err || self._checkUpdateModifier(modifier);
		if (err) {callback(err); return;}
		docs = docs.map(function(doc) {
			return self._updateDoc(doc, modifier);
		});
		if (docs.length) {
			self.put(docs, function(err) {
				callback(err, docs.length);
			});
		} else {
			callback(null, 0);
		}
	});
};


DocsSection.prototype._checkUpdateModifier = function(modifier) {
	if (typeof modifier !== 'function' && typeof modifier !== 'object') {
		return new Error(
			'Modifier should be function or object, not ' + typeof modifier
		);
	}
};

DocsSection.prototype._updateDoc = function(doc, modifier) {
	var newDoc = null;
	if (typeof modifier === 'function') {
		newDoc = modifier(doc);
	} else if (typeof modifier === 'object') {
		for (var key in modifier) {
			doc[key] = modifier[key];
		}
		newDoc = doc;
	}
	return newDoc;
};

/**
 * Delete documents by array of their ids or array of objects with `id` field
 * @param {String[]|Object[]} ids
 * @param {Function} [callback(err)]
 */
DocsSection.prototype.del = function(ids, callback) {
	var self = this;
	if (!Array.isArray(ids)) ids = [ids];
	if (ids.length === 0) {callback(new Error('Nothing to del')); return;}
	var firstDoc = ids[0];
	if (typeof firstDoc === 'object') {
		var err = this._validateDocs(ids);
		if (err) {callback(err); return;}
		ids = ids.map(function(doc) {
			return doc.id;
		});
	}

	var docsReady = 0,
		operations = [];

	ids.forEach(function(id) {
		self.get({id: id}, function(err, oldDoc) {
			// TODO: check exactly for NotFound error
			if (oldDoc) {
				self.projections.forEach(function(projection) {
					operations.push({
						type: 'del',
						key: self._getProjKey(oldDoc, projection)
					});
				});
				docsReady++;
			} else {
				docsReady++;
			}
			if (docsReady === ids.length) self.db.batch(operations, callback);
		});
	});
};


function noop() {}

function extend(dst, src) {
	for (var key in src) {dst[key] = src[key];}
	return dst;
}

exports.db = require('level');
exports.ValSection = ValSection;
exports.DocsSection = DocsSection;
