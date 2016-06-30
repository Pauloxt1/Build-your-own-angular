'use strict';

function initWatchVal(){

}

function Scope(){
  this.$$watchers = [];
}

Scope.prototype.$watch = function(watchFn, listenerFn){
  var watcher = {
    watchFn: watchFn,
    listenerFn: listenerFn || function(){},
    last: initWatchVal
  };
  this.$$watchers.push(watcher);
};

Scope.prototype.$$digestOnce = function(){
    var self = this;
    var newValue, oldValue, dirty;

  _.forEach(this.$$watchers, function(watcher){
    newValue = watcher.watchFn(self);
    oldValue = watcher.last;

    if(newValue != oldValue){
        watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), self);
        watcher.last = newValue;
        dirty = true;
    }
  });
  return dirty;
};

Scope.prototype.$digest = function(){
  var ttl = 10;
  var dirty;
  do{
    if(dirty && !(ttl--)){
      throw "10 digest interations reached";
    }
    dirty = this.$$digestOnce();

  }while(dirty);
};
