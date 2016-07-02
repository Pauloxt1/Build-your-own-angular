'use strict';

function initWatchVal(){

}

function Scope(){
  this.$$watchers = [];
  this.$$asyncQueue = [];
  this.$$applyAsyncQueue = [];
  this.$$postDigestQueue = [];
  this.$$lastDirtyWatch = null;
  this.$$phase = null;
  this.$$applyAsyncId = null;
}

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq){
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function(){},
    valueEq: !!valueEq,
    last: initWatchVal
  };
  this.$$lastDirtyWatch = null;
  this.$$watchers.push(watcher);
};

Scope.prototype.$$digestOnce = function(){
    var self = this;
    var newValue, oldValue, dirty;

  _.forEach(this.$$watchers, function(watcher){
    newValue = watcher.watchFn(self);
    oldValue = watcher.last;

    if(!self.$$areEqual(newValue, oldValue, watcher.valueEq)){
        self.$$lastDirtyWatch = watcher;
        watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), self);
        watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
        dirty = true;
    } else if(self.$$lastDirtyWatch == watcher){
        return false;
    }
  });
  return dirty;
};

Scope.prototype.$digest = function(){
  var ttl = 10;
  var dirty;
  this.$$lastDirtyWatch = null;
  this.$beginPhase("$digest");

  if(this.$$applyAsyncId){
    clearTimeout(this.$$applyAsyncId);
    this.$$flushApplyAsync();
  }

  do{
    while(this.$$asyncQueue.length){
      var asyncTask = this.$$asyncQueue.shift();
      asyncTask.scope.$eval(asyncTask.expression);
    }
    dirty = this.$$digestOnce();

    if(!(ttl--) && (dirty || this.$$asyncQueue.length)){
      this.$cleanPhase();
      throw "10 digest interations reached";
    }

  }while(dirty || this.$$asyncQueue.length);
  this.$cleanPhase();

  while(this.$$postDigestQueue.length){
    this.$$postDigestQueue.shift()();
  }
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq){
  if(valueEq){
    return _.isEqual(newValue, oldValue);
  } else {
    return newValue === oldValue || (typeof newValue == 'number' && typeof oldValue == 'number' && isNaN(newValue) && isNaN(oldValue));
  }
};

Scope.prototype.$eval = function(expr, locals){
  return expr(this, locals);
};

Scope.prototype.$apply = function(expr){
  try{
    this.$beginPhase("$apply");
    return this.$eval(expr);
  } finally{
      this.$cleanPhase();
      this.$digest();
  }
};

Scope.prototype.$evalAsync = function(expr){
  var self = this;
  if(!self.$$phase && !self.$$asyncQueue.length){
    setTimeout(function(){
      if(self.$$asyncQueue.length){
        self.$digest();
      }
    }, 0);
  }
  this.$$asyncQueue.push({scope: this, expression: expr});
};

Scope.prototype.$beginPhase = function(phase){
  if(this.$$phase){
    throw this.$$phase + ' alredy in progress';
  }
  this.$$phase = phase;
};

Scope.prototype.$cleanPhase = function(){
  this.$$phase = null;
};

Scope.prototype.$applyAsync = function(expr){
  var self = this;

  self.$$applyAsyncQueue.push(function(){
    self.$eval(expr);
  });

    if(self.$$applyAsyncId === null){
      self.$$applyAsyncId = setTimeout(function(){
        self.$apply(_.bind(self.$$flushApplyAsync, self));
    }, 0);
  }
};

Scope.prototype.$$flushApplyAsync = function(a){
  while(this.$$applyAsyncQueue.length){
    this.$$applyAsyncQueue.shift()();
  }
  this.$$applyAsyncId = null;
};

Scope.prototype.$$postDigest = function(fn){
  this.$$postDigestQueue.push(fn);
};
