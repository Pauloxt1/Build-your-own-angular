"use strict";

var ESCAPES = {
  'n' : '\n', 'f' : '\f', 'r': '\r', 't': '\t', 'v' : '\v',
  '\'': '\'', '"' : '"'
};

function parse(expr){
  var lexer = new Lexer();
  var parser = new Parser(lexer);
  return parser.parse(expr);
}


function Lexer(){

}

Lexer.prototype.lex = function(text){
  this.text = text;
  this.index = 0;
  this.ch = undefined;
  this.tokens = [];

  while(this.index < this.text.length){
    this.ch = this.text.charAt(this.index);
    if(this.isNumber(this.ch) || (this.is('.') && this.isNumber(this.peek()))){
      this.readNumber();
    } else if(this.is('"\'')) {
      this.readString(this.ch);
    } else if(this.isIdent(this.ch)){
      this.readIdent();
    } else if(this.isWhiteSpace(this.ch)){
      this.index++;
    } else if(this.is('[],{}:.()=')){
      this.tokens.push({
        text:this.ch
      });
      this.index++;
    }  else {
      throw 'Unexpected next character '+this.ch;
    }
  }

  return this.tokens;
};

Lexer.prototype.is = function(chs){
  return (chs.indexOf(this.ch) >= 0);
};

Lexer.prototype.readString = function(quote){
  this.index++;
  var string = '';
  var escape = false;

  while(this.index < this.text.length){
    var ch = this.text.charAt(this.index);

    if(escape){
      var replacement = ESCAPES[ch];

      if(ch === 'u'){
        var hex = this.text.substring(this.index+1, this.index+5);
        if(!hex.match(/[\da-f]{4}/i)){
          throw 'Invalid unicode scape';
        }
        this.index += 4;
        string += String.fromCharCode(parseInt(hex, 16));
      } else {
        if(replacement){
          string += replacement;
        } else {
          string += ch;
        }
      }
      escape = false;
    } else if(ch === quote){
      this.index++;
      this.tokens.push({
        text: string,
        value: string
      });
      return;

    } else if(ch === '\\'){
      escape = true;
    } else {
      string += ch;
    }
    this.index++;
  }
  throw 'Unamatched quote';
};

Lexer.prototype.readNumber = function(){
  var number = '';
  while(this.index < this.text.length){
    var ch = this.text.charAt(this.index).toLowerCase();
    if(this.isNumber(ch) || (ch === '.')){
      number += ch;
    } else {
      var nextCh = this.peek();
      var prevCh = number.charAt(number.length - 1);
      if(ch == 'e' && this.isExpOperator(nextCh)){
        number += ch;
      } else if(this.isExpOperator(ch) && prevCh == 'e' && nextCh && this.isNumber(nextCh)){
        number += ch;
      } else if(this.isExpOperator(ch) && prevCh == 'e' && (!nextCh || !this.isNumber(nextCh))){
        throw 'Invalid expoent';
      }  else {
        break;
      }
    }
    this.index++;
  }
  this.tokens.push({
    text: number,
    value: Number(number)
  });
};

Lexer.prototype.isNumber = function(ch){
  return ch >= '0' && ch <= '9';
};

Lexer.prototype.peek = function(){
  return (this.index < this.text.length - 1) ? this.text.charAt(this.index+1) : false;
};

Lexer.prototype.isExpOperator = function(ch){
  return ch === '-' || ch === '+' || this.isNumber(ch);
};

Lexer.prototype.isIdent = function(ch){
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
};

function AST(lexer){
  this.lexer = lexer;
}

Lexer.prototype.readIdent = function(){
  var text = '';
  while(this.index < this.text.length){
    var ch = this.text.charAt(this.index);
    if(this.isIdent(ch) || this.isNumber(ch)){
      text += ch;
    } else {
      break;
    }
    this.index++;
  }

  var token = {text:text, indentifier: true};
  this.tokens.push(token);
};

Lexer.prototype.isWhiteSpace = function(ch){
  return ch === ' ' || ch === '\r' || ch === '\t' || ch === '\n' || ch === '\v' || ch === '\u00A0';
};

AST.Program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Indentifier = 'Indentifier';
AST.ThisExpression = 'ThisExpression';
AST.MemberExpression = 'MemberExpression';
AST.CallExpression = 'CallExpression';
AST.AssigmentExpression = 'AssigmentExpression';

AST.prototype.ast = function(text){
  this.tokens = this.lexer.lex(text);
  return this.program();
};

AST.prototype.program = function(){
  return {type: AST.Program, body:this.assigment()};
};

AST.prototype.primary = function(){
  var primary;
  if(this.expect('[')){
    primary = this.arrayDeclaration();
  } else if(this.expect('{')){
    primary = this.object(primary);
  } else if(this.constants.hasOwnProperty(this.peek().text)){
    primary = this.constants[this.consume().text];
  } else if(this.peek().indentifier){
    primary = this.indentifier();
  } else {
    primary = this.constant();
  }
  var next;
  while(next = this.expect('.', '[', '(')){
    if(next.text === '['){
      primary = {
        type: AST.MemberExpression,
        object: primary,
        property: this.primary(),
        computed: true
      };
      this.consume(']');
    } else if(next.text === '.') {
      primary = {
        type: AST.MemberExpression,
        object: primary,
        property: this.indentifier(),
        computed: false
      };
    } else if(next.text === '('){
      primary = {
        type: AST.CallExpression,
        callee: primary,
        arguments: this.parseArguments()
      };
      this.consume(')');
    }
  }
  return primary;
};

AST.prototype.parseArguments = function(){
  var args = [];
  if(!this.peek(')')){
    do {
      args.push(this.assigment());
    } while(this.expect(','));
  }
  return args;
};

AST.prototype.object = function(){
  var properties = [];
  if(!this.peek('}')){
    do{
      var property = {type: AST.Property};

      if(this.peek().indentifier){
        property.key = this.indentifier();
      } else {
        property.key = this.constant();
      }

      this.consume(':');
      property.value = this.assigment();
      properties.push(property);
    }while(this.expect(','));
  }
  this.consume('}');
  return {type: AST.ObjectExpression, properties: properties};
};

AST.prototype.indentifier = function(){
  return {type: AST.Indentifier, name: this.consume().text};
};


AST.prototype.arrayDeclaration = function(){
  var elements = [];

  if(!this.peek(']')){
    do{
      if(this.peek(']')){
        break;
      }
      elements.push(this.assigment());
    }while(this.expect(','));
  }

  this.consume(']');
  return {type: AST.ArrayExpression, elements: elements};
};

AST.prototype.expect = function(e1, e2, e3, e4){
  var token = this.peek(e1, e2, e3, e4);
  if(token){
    return this.tokens.shift();
  }
};

AST.prototype.consume = function(e){
  var token = this.expect(e);
  if(!token){
    throw 'Unexpected.  Expecting: '+e;
  }
  return token;
};

AST.prototype.peek = function(e1, e2, e3, e4){
  if(this.tokens.length > 0){
    var text = this.tokens[0].text;
    if( (text === e1 || text === e2 || text === e3 || text === e4) || (!e1 && !e2 && !e3 && !e4)){
      return this.tokens[0];
    }
  }
};

AST.prototype.constants = {
  'null': {type:AST.Literal, value: null},
  'true': {type:AST.Literal, value: true},
  'false': {type:AST.Literal, value: false},
  'this': {type: AST.ThisExpression}
};

AST.prototype.constant = function(){
  return {type: AST.Literal, value: this.consume().value};
};

AST.prototype.assigment = function(){
  var left = this.primary();
  if(this.expect('=')){
    var right = this.primary();
    return {type: AST.AssigmentExpression, left:left, right:right};
  };
  return left;
}

function ASTCompiler(astBuilder){
  this.astBuilder = astBuilder;
}

ASTCompiler.prototype.compile = function(text){
  var ast = this.astBuilder.ast(text);
  this.state = {body:[], nextId:0, vars:[]};
  this.recurse(ast);
  /* jshint -W054 */
  return new Function('s', 'l',
  (this.state.vars.length ? 'var '+this.state.vars.join(',')+';' : '')+
  this.state.body.join(''));
  /* jshint +W054 */
};

ASTCompiler.prototype.nextId = function(){
  var id = 'v'+(this.state.nextId++);
  this.state.vars.push(id);
  return id;
};

ASTCompiler.prototype.recurse = function(ast, context){
  var self = this;
  var intoId;
  switch(ast.type){
    case AST.Program:
      this.state.body.push('return ', this.recurse(ast.body), ';');
    break;
    case AST.Literal:
      return this.escape(ast.value);
    case AST.ArrayExpression:
      var elements = _.map(ast.elements, function(element){
          return self.recurse(element);
      });
      return '['+elements.join(',')+']';
    case AST.ObjectExpression:
    var properties = _.map(ast.properties, function(property){
        var key = property.key.type === AST.Indentifier ?
        property.key.name :
        self.escape(property.key.value);
        var value = self.recurse(property.value);
        return key+':'+value;
    });
    return '{'+properties.join(',')+'}';
    case AST.Indentifier:
     intoId = this.nextId();
     this.if_(this.getHasOwnProperty('l', ast.name), this.assing(intoId, this.nonComputedMember('l', ast.name)));
     this.if_(this.not(this.getHasOwnProperty('l', ast.name))+' && s', this.assing(intoId, this.nonComputedMember('s', ast.name)));
     if(context){
       context.context = this.getHasOwnProperty('l', ast.name) + '?l:s';
       context.name = ast.name;
       context.computed = false;
     }
     return intoId;
    case AST.ThisExpression:
      return 's';
    case AST.MemberExpression:
      intoId = this.nextId();
      var left = this.recurse(ast.object);
      if(context){
        context.context = left;
      }
      if(ast.computed){
        var right = this.recurse(ast.property);
        this.if_(left, this.assing(intoId, this.ComputedMember(left, right)));
        if(context){
          context.name = right;
          context.computed = true;
        }
      } else {
        this.if_(left, this.assing(intoId, this.nonComputedMember(left, ast.property.name)));
        if(context){
          context.name = ast.property.name;
          context.computed = false;
        }
      }
      return intoId;
    case AST.CallExpression:
    var callContext = {};
    var callee = this.recurse(ast.callee, callContext);
    var args = _.map(ast.arguments, function(arg){
      return self.recurse(arg);
    });
    if(callContext.name){
      if(callContext.computed){
        callee = this.ComputedMember(callContext.context, callContext.name);
      } else {
        callee = this.nonComputedMember(callContext.context, callContext.name);
      }
    }
    return callee+'&&'+callee+'('+args.join(',')+')';
    case AST.AssigmentExpression:
    var leftContext = {};
    this.recurse(ast.left, leftContext);
    var leftExpr;

    if(leftContext.computed){
      leftExpr = this.ComputedMember(leftContext.context, leftContext.name);
    } else {
      leftExpr = this.nonComputedMember(leftContext.context, leftContext.name);
    }
    return this.assing(leftExpr, this.recurse(ast.right));
  }
};


ASTCompiler.prototype.ComputedMember = function(left, right){
  return '('+left+')['+ right +']';
}

ASTCompiler.prototype.not = function(e){
  return '!('+ e +')';
};

ASTCompiler.prototype.getHasOwnProperty = function(object, property){
  return object + '&&('+this.escape(property)+' in '+object+' ) ';
};

ASTCompiler.prototype.assing = function(id, value){
  return id + '=' + value +';';
};

ASTCompiler.prototype.if_ = function(test, consequent){
  this.state.body.push('if(',test,'){', consequent ,'}');
};

ASTCompiler.prototype.nonComputedMember = function(left, right){
  return '('+left+').'+right;
};

ASTCompiler.prototype.escape = function(value){
  if(_.isString(value)){
    return '\''+value.replace(this.stringEscapeRegex, this.stringEscapeFn)+'\'';
  } else if(_.isNull(value)){
      return 'null';
  } else {
    return value;
  }
};

ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;

ASTCompiler.prototype.stringEscapeFn = function(c){
  return '\\u'+('000'+ c.charCodeAt(0).toString(16)).slice(-4);
};

function Parser(lexer){
  this.lexer = lexer;
  this.ast = new AST(this.lexer);
  this.ASTCompiler = new ASTCompiler(this.ast);
}

Parser.prototype.parse = function(text){
  return this.ASTCompiler.compile(text);
};
