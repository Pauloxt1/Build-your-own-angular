'use strict';

describe("Scope", function(){

    it("Can be constructed and used as an object", function(){
      var scope = new Scope();
      scope.aProperty = 1;

      expect(scope.aProperty).toBe(1);
    });

});


describe("Digest", function(){

  var scope;

  beforeEach(function(){
    scope = new Scope();
  });

  it("calls the listener function of watch on first $digest", function(){
    var watchFn = function(){
      return 'wat';
    };

    var listenerFn = jasmine.createSpy();
    scope.$watch(watchFn, listenerFn);

    scope.$digest();

    expect(listenerFn).toHaveBeenCalled();
  });

  it("calls the watch function with the scope as argument", function(){
    var watchFn = jasmine.createSpy();
    var listenerFn = function(){};

    scope.$watch(watchFn, listenerFn);

    scope.$digest();

    expect(watchFn).toHaveBeenCalledWith(scope);
  });

  it("calls the listener function when the wacthed value changes", function(){
    scope.someValue = 0;
    scope.counter = 0;

    scope.$watch(
      function(scope){
        return scope.someValue;
      },
      function(newValue, oldValue, scope){
        scope.counter++;
      }
    );

    expect(scope.counter).toBe(0);

    scope.$digest();
    expect(scope.counter).toBe(1);

    scope.$digest();
    expect(scope.counter).toBe(1);

    scope.someValue = 'b';
    expect(scope.counter).toBe(1);

    scope.$digest();
    expect(scope.counter).toBe(2);

  });

});
