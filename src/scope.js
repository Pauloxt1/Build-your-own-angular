'use strict';

function initWatchVal(){

}

function Scope(){
  this.$$watchers = [];
  this.$$asyncQueue = [];
  this.$$applyAsyncQueue = [];
  this.$$postDigestQueue = [];
  this.$$children = [];
  this.$$lastDirtyWatch = null;
  this.$$phase = null;
  this.$$applyAsyncId = null;
  this.$root = this;
}

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq){
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function(){},
    valueEq: !!valueEq,
    last: initWatchVal
  };
  this.$root.$$lastDirtyWatch = null;
  this.$$watchers.unshift(watcher);

  var self = this;

  return function(){
    var index = self.$$watchers.indexOf(watcher);
    if(index >= 0){
      self.$$watchers.splice(index, 1);
      self.$root.$$lastDirtyWatch = null;
    }
  };
};

Scope.prototype.$$digestOnce = function(){
    var continueLoop = true;
    var self = this;
    var dirty;

    this.$$everyScope(function(scope){
      var newValue, oldValue;

      _.forEachRight(scope.$$watchers, function(watcher){
        try{
          if(watcher){
            newValue = watcher.watchFn(scope);
            oldValue = watcher.last;

            if(!scope.$$areEqual(newValue, oldValue, watcher.valueEq)){
                self.$root.$$lastDirtyWatch = watcher;
                watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
                watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), scope);
                dirty = true;
            } else if(self.$root.$$lastDirtyWatch == watcher){
                continueLoop = false;
                return false;
            }
          }
        } catch(e){
          console.log(e);
        }
      });
      return continueLoop;
  });
  return dirty;
};

Scope.prototype.$digest = function(){
  var ttl = 10;
  var dirty;
  this.$root.$$lastDirtyWatch = null;
  this.$beginPhase("$digest");

  if(this.$root.$$applyAsyncId){
    clearTimeout(this.$root.$$applyAsyncId);
    this.$$flushApplyAsync();
  }

  do{

  while(this.$$asyncQueue.length){
    try{
      var asyncTask = this.$$asyncQueue.shift();
      asyncTask.scope.$eval(asyncTask.expression);
    } catch(e){
      console.log(e);
    }
  }

    dirty = this.$$digestOnce();

    if(!(ttl--) && (dirty || this.$$asyncQueue.length)){
      this.$cleanPhase();
      throw "10 digest interations reached";
    }

  }while(dirty || this.$$asyncQueue.length);
  this.$cleanPhase();


    while(this.$$postDigestQueue.length){
      try{
        this.$$postDigestQueue.shift()();
      } catch(e){
        console.log(e);
      }
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
      this.$root.$digest();
  }
};

Scope.prototype.$evalAsync = function(expr){
  var self = this;
  if(!self.$$phase && !self.$$asyncQueue.length){
    setTimeout(function(){
      if(self.$$asyncQueue.length){
        self.$root.$digest();
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

    if(self.$root.$$applyAsyncId === null){
      self.$root.$$applyAsyncId = setTimeout(function(){
        self.$apply(_.bind(self.$$flushApplyAsync, self));
    }, 0);
  }
};

Scope.prototype.$$flushApplyAsync = function(a){
  while(this.$$applyAsyncQueue.length){
    try{
      this.$$applyAsyncQueue.shift()();
    } catch(e){
      console.log(e);
    }
  }
  this.$root.$$applyAsyncId = null;
};

Scope.prototype.$$postDigest = function(fn){
  this.$$postDigestQueue.push(fn);
};

Scope.prototype.$watchGroup = function(watchFns, listenerFn){
  var self = this;
  var newValues = new Array(watchFns.length);
  var oldValues = new Array(watchFns.length);
  var changeReactionScheduled = false;
  var firstRun = true;

  if(watchFns.length === 0){
    var shoudCall = true;
      self.$evalAsync(function(){
        if(shoudCall){
          listenerFn(newValues, oldValues, self);
        }
      });
    return function(){
      shoudCall = false;
    };
  }

  function watchGroupListener(){
    if(firstRun){
      listenerFn(newValues, newValues, self);
      firstRun = false;
    } else {
      listenerFn(newValues, oldValues, self);
    }
    changeReactionScheduled = false;
  }

  var destroyFunctions = _.map(watchFns, function(watchFn, i){
    return self.$watch(watchFn, function(newValue, oldValue, scope){
      newValues[i] = newValue;
      oldValues[i] = oldValue;
      if(!changeReactionScheduled){
        changeReactionScheduled = true;
        self.$evalAsync(watchGroupListener);
      }
    });
  });

  return function(){
    _.forEach(destroyFunctions, function(destroyFunction){
      destroyFunction();
    });
  };
};


Scope.prototype.$new = function(isolated, parent){
  var child;
  parent = parent || this;
  if(isolated){
    child = new Scope();
    child.$root = parent;
    child.$$asyncQueue = parent.$$asyncQueue;
    child.$$postDigestQueue = parent.$$postDigestQueue;
    child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
  } else {
    child = Object.create(this);
  }
  parent.$$children.push(child);
  child.$$children = [];
  child.$$watchers = [];
  child.$parent = parent;
  return child;
};

Scope.prototype.$$everyScope = function(fn){
  if(fn(this)){
    return this.$$children.every(function(scope){
      return scope.$$everyScope(fn);
    });
  } else {
    return false;
  }
};

Scope.prototype.$destroy = function(){
  if(this.$parent){
    var siblings = this.$parent.$$children;
    var indexOfThis = siblings.indexOf(this);
    if(indexOfThis >= 1){
      siblings.slice(indexOfThis, 1);
    }
  }
  this.$$watchers = null;
};
