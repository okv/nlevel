'use strict';

var inherits = require('util').inherits;

// etalon for compare with parameters reserved only for internal usage
var internalParam = {};

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

	if ('withUniqueId' in options === false) {
		options.withUniqueId = true;
	}
	this.withUniqueId = options.withUniqueId;

	this.projections = (
		this.withUniqueId ? [{key: {id: 1}}] : []
	).concat(options.projections || []);

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

	self._beforePut(docs, function(err) {
		if (err) {callback(err); return;}

		var validationError = self._validateDocs(docs);
		if (validationError) {callback(validationError); return;}

		var docsReady = 0,
			operations = [];

		var put = function(doc, oldDoc) {
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
			if (docsReady === docs.length) {
				self.db.batch(operations, function(err) {
					if (err) {callback(err); return;}
					self._afterPut(docs, callback);
				});
			}
		};

		docs.forEach(function(doc) {
			if (self.withUniqueId) {
				self.get({id: doc.id}, function(err, oldDoc) {
					// TODO: check exactly for NotFound error
					put(doc, oldDoc);
				});
			} else {
				put(doc);
			}
		});
	});

};

// private api, but could be overwritten for extending
DocsSection.prototype._beforePut = function(docs, callback) {
	callback();
};

// private api, but could be overwritten for extending
DocsSection.prototype._afterPut = function(docs, callback) {
	callback();
};

DocsSection.prototype._validateDocs = function(docs) {
	if (!this.withUniqueId) {
		return;
	}
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
 * - `params.offset` - integer, documents count to skip
 * - `params.limit` - maximum count of documents in result
 * - `params.usingValues` - (false by default) optimization flag, which can be
 * set to force of using `values` for some operations which uses `keys` by default
 * (e.g. counting)
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

	// don't use `keys` by default
	params.keys = false;
	// but we can use `values` instead (if some conditions will be complied)
	if (params.countOnly === internalParam && !params.usingValues) {
		// we need values or keys for counting, but values also required for
		// filtering
		params.keys = !Boolean(params.filter);
	}
	// `values` is always invertion of using `keys` coz we use only one of them
	params.values = !params.keys;

	var limit;
	// if filter is set with limit then limit will be processed manually, over
	// the levelup, coz levelup don't know about filter
	if (params.filter && params.limit && params.countOnly !== internalParam) {
		limit = params.limit;
		delete params.limit;
	}

	var result = params.countOnly === internalParam ? 0 : [];

	var addToResult = null;
	if (params.offset) {
		//TODO: posibly optimize offset without filter - use keys first, then
		//`values`
		var skippedCount = 0;
		addToResult = function (data) {
			if (skippedCount >= params.offset) {
				result.push(data);
			} else {
				skippedCount++;
			}
		};
	} else {
		addToResult = function (data) {
			result.push(data);
		};
	}

	var dataIter = null;
	//TODO: check is different functions give significant performance improvement
	if (params.filter) {
		if (params.countOnly === internalParam) {
			dataIter = function(data) {
				if (params.filter(data)) result++;
			};
		} else {
			dataIter = function(data) {
				if (params.filter(data)) addToResult(data);
			};
		}
	} else {
		if (params.countOnly === internalParam) {
			dataIter = function(data) {
				result++;
			};
		} else {
			dataIter = function(data) {
				addToResult(data);
			};
		}
	}

	var stream = self.db.createReadStream(params),
		isCallabckCalled = false;

	var onceCallableCallback = function(err, result) {
		if (!isCallabckCalled) {
			isCallabckCalled = true;
			callback(err, result);
		}
	};

	stream
		.on('readable', function() {
			var data;
			while (data = stream.read()) {
				dataIter(data);

				if (limit && limit === result.length) {
					stream.destroy();
					onceCallableCallback(null, result);

					return;
				}
			}

		})
		.on('end', function() {
			onceCallableCallback(null, result);
		})
		.on('error', onceCallableCallback);
};

/**
 * Count documents using `findParams` (see `find`).
 * Notice: It counts keys (or values) internally (can take long time e.g. on
 * large dataset)
 * @param {Object} findParams
 * @param {Function} [callback(err,documentsCount)]
 */
DocsSection.prototype.count = function(findParams, callback) {
	findParams = extend({}, findParams);
	delete findParams.limit;
	delete findParams.offset;
	findParams.countOnly = internalParam;
	this.find(findParams, callback);
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
	if (!self.withUniqueId) {
		return callback(new Error('Can`t update when no unique id'));
	}
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
	if (!self.withUniqueId) {
		return callback(new Error('Can`t update when no unique id'));
	}
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
	if (!self.withUniqueId) {
		return callback(new Error('Can`t del when no unique id'));
	}
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

exports.db = require('levelup');
exports.ValSection = ValSection;
exports.DocsSection = DocsSection;
