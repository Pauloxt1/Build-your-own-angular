'use strict';

describe("parse", function(){

  it("can parser an integer", function(){
    var fn = parse('42');
    expect(fn).toBeDefined();
    expect(fn()).toBe(42);
  });

});
