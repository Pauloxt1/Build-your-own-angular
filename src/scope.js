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
  this.$$listeners = {};
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
  child.$$listeners = {};
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

Scope.prototype.$watchCollection = function(watchFn, listerFn){
  var newValue;
  var oldValue;
  var self = this;
  var oldLength;
  var veryOldValue;
  var trackVeryOldValue = (listerFn.length > 1);
  var changeCount = 0;
  var firstRun = true;

  var internalWatchFn = function(scope){
    var newLength;
    newValue = watchFn(scope);

    if(_.isObject(newValue)){
      if(_.isArrayLike(newValue)){
        if(!_.isArray(oldValue)){
          changeCount++;
          oldValue = [];
        }
        if(newValue.length !== oldValue.length){
          changeCount++;
          oldValue.length = newValue.length;
        }
        _.forEach(newValue, function(newItem, i){
          var bothNaN = (_.isNaN(newItem) && _.isNaN(oldValue[i]));

          if(!bothNaN && newItem != oldValue[i]){
              changeCount++;
              oldValue[i] = newItem;
          }
        });

      } else {
          if(!_.isObject(oldValue) || _.isArrayLike(oldValue)){
            changeCount++;
            oldValue = {};
            oldLength = 0;
          }
          newLength = 0;
          _.forOwn(newValue, function(newVal, key){
            newLength++;
            var bothNaN = (_.isNaN(newVal) && _.isNaN(oldValue[key]));

            if(oldValue.hasOwnProperty(key)){
              if(!bothNaN && oldValue[key] !== newVal){
                changeCount++;
                oldValue[key] = newVal;
              }
            } else{
              changeCount++;
              oldLength++;
              oldValue[key] = newVal;
            }
          });
          if(oldLength > newLength){
          _.forOwn(oldValue, function(oldVal, key){
            if(!newValue.hasOwnProperty(key)){
              changeCount++;
              oldLength--;
              delete oldValue[key];
            }
          });
        }
      }

    } else {
      if(!self.$$areEqual(newValue, oldValue, false)){
          changeCount++;
      }
      oldValue = newValue;
    }

    return changeCount;
  };
  var internalListenerFn = function(){
    if(firstRun){
      listerFn(newValue, newValue, self);
      firstRun = false;
    } else {
      listerFn(newValue, veryOldValue, self);
    }

    if(trackVeryOldValue){
      veryOldValue = _.clone(newValue);
    }
  };

  return this.$watch(internalWatchFn, internalListenerFn);
};


Scope.prototype.$on = function(eventName, listener){
  var listeners = this.$$listeners[eventName];

  if(!listeners){
   this.$$listeners[eventName] = listeners = [];
  }
  listeners.push(listener);

  return function(){
    var index = listeners.indexOf(listener);
    if(index >= 0){
      listeners[index] = null;
    }
  };
};

Scope.prototype.$emit = function(eventName){
    var propagationStopped = false;
    var event = {
      name: eventName,
      targetScope: this,
      stopPropagation: function(){
        propagationStopped = true;
      }
    };
    var aditionalArgs = Array.prototype.slice.call(arguments, 1);
    var listenerArgs = [event].concat(aditionalArgs);
    var scope = this;

    do{
     event.currentScope = scope;
     scope.$$fireEventOnScope(eventName, listenerArgs);
     scope = scope.$parent;
   }while(scope && !propagationStopped);

   event.currentScope = null;

   return event;
};


Scope.prototype.$broadcast = function(eventName){
    var event = {name: eventName, targetScope: this};
    var aditionalArgs = Array.prototype.slice.call(arguments, 1);
    var listenerArgs = [event].concat(aditionalArgs);

    this.$$everyScope(function(scope){
      event.currentScope = scope;
      scope.$$fireEventOnScope(eventName, listenerArgs);
      return true;
    });

    event.currentScope = null;

    return event;
};

Scope.prototype.$$fireEventOnScope = function(eventName, listenerArgs){
  var listeners = this.$$listeners[eventName] || [];
  var i = 0;

  while(i < listeners.length){
    if(listeners[i] === null){
      listeners.splice(i, 1);
    } else {
      listeners[i].apply(null, listenerArgs);
      i++;
    }
  }

  return event;
};
