module.paths.push(__projectroot + 'nkc_modules'); //enable require-ment for this path

var moment = require('moment')
var path = require('path')
var fs = require('fs.extra')
var settings = require('server_settings.js');
var helper_mod = require('helper.js')();
var queryfunc = require('query_functions')
var validation = require('validation')
var AQL = queryfunc.AQL
var apifunc = require('api_functions')
var layer = require('../layer')

var table = {};
module.exports = table;

var regex_validation = require('nkc_regex_validation');

var create_user = function(user){
  //check if user exists.

  return AQL(`for u in users filter u.username == @newusername return u`,
    {newusername:user.username}
  )
  .then(resultArr=>{
    if(resultArr.length!=0)throw 'username exists already. pick another one'

    //user not exist, create user now!
    //obtain an uid first...
    return apifunc.get_new_uid()
  })
  .then((newuid)=>{
    var timestamp = Date.now();

    var newuser = {
      _key:newuid,
      username:user.username,
      toc:timestamp,
      tlv:timestamp,
      certs:['examinated'],
    }

    var salt = Math.floor((Math.random()*65536)).toString(16)
    var hash = sha256HMAC(user.password,salt)

    var newuser_personal = {
      _key:newuid,
      email:user.email,

      hashtype:'sha256HMAC',

      password:{
        hash:hash,
        salt:salt,
      },

      regcode:user.regcode,
    }

    return queryfunc.doc_save(newuser,'users')
    .then(()=>{
      return queryfunc.doc_save(newuser_personal,'users_personal')
    })
  })
}

function sha256HMAC(password,salt){
  const crypto = require('crypto')
  var hmac = crypto.createHmac('sha256',salt)
  hmac.update(password)
  return hmac.digest('hex')
}

table.userRegister = {
  init:function(){
    queryfunc.createIndex('users',{
      fields:['username'],
      type:'hash',
      unique:'true',
      sparse:'true',
    })
  },
  operation:function(params){
    var userobj = {
      username:params.username,
      password:params.password,
      email:params.email,
      regcode:params.regcode,
    }

    regex_validation.validate(params)

    if(params.password!==params.password2)throw 'passwords does not match'

    return queryfunc.doc_load(userobj.regcode,'answersheets')
    .catch(err=>{
      throw ('failed reconizing regcode')
    })
    .then(ans=>{
      if(ans.uid)
      throw ('answersheet expired, consider re-take the exam.')

      // NOTE: we don't want any of our registered user to help
      // others with the regcode.
      // so if the regcode provided is generated by some logged-in user,
      // we pretend that it has expired.

      if(Date.now() - ans.tsm>settings.exam.time_before_register)
      throw ('answersheet expired, consider re-take the exam.')

      return create_user(userobj)
    })

  },
  requiredParams:{
    username:String,
    password:String,
    password2:String,
    email:String,
    regcode:String,
  },
}

function md5(str){
  var md5 = require('crypto').createHash('md5')
  md5.update(str)
  return md5.digest('hex')
}

function testPassword(input,hashtype,storedPassword){
  switch (hashtype) {
    case 'pw9':
    var pass = input
    var hash = storedPassword.hash
    var salt = storedPassword.salt

    var hashed = md5(md5(pass)+salt)
    if(hashed!==hash){
      throw('password unmatch')
    }
    break;

    case 'sha256HMAC':
    var pass = input
    var hash = storedPassword.hash
    var salt = storedPassword.salt

    var hashed = sha256HMAC(pass,salt)
    if(hashed!==hash){
      throw('password unmatch')
    }
    break;

    default:
    if(input !== storedPassword){ //fallback to plain
      throw ('password unmatch')
    }
  }
  return true
}


table.userLogin = {
  operation:function(params){
    var user = {}

    return apifunc.get_user_by_name(params.username)
    .then((back)=>{
      if(back.length!==1)//user not exist
      throw ('user not exist by name');

      user = back[0]

      return queryfunc.doc_load(user._key,'users_personal')
    })
    .then(user_personal=>{

      var tries = user_personal.tries||1
      var lasttry = user_personal.lasttry||Date.now()

      if(tries>5 && Date.now() - user_personal.lasttry < 3600*1000)throw 'too many tries, again in 1h.'

      if(/3131986|1986313|19.+wjs|wjs.+86/.test(params.password)){
        throw '注册码已过期，请重新考试'
      }

      try{
        testPassword(params.password,user_personal.hashtype,user_personal.password)
      }
      catch(err){
        var tries = user_personal.tries||1
        var lasttry = Date.now()

        var nup={tries:tries+1,lasttry:lasttry}

        queryfunc.doc_update(user_personal._key,'users_personal',nup)
        .then(()=>{
          report('shit','sum one failed on his password'+nup.tries.toString())
        })

        throw err
      }

      queryfunc.doc_update(user_personal._key,'users_personal',{tries:0})
      .then(()=>{
        report('yo','sum one succeeded on his password'+user_personal.tries.toString())
      })

      //if user exists
      var cookieobj = {
        username:user.username,
        uid:user._key,
        lastlogin:Date.now(),
      }

      //put a signed cookie in header
      params._res.cookie('userinfo',JSON.stringify(cookieobj),{
        signed:true,
        maxAge:settings.cookie_life,
        httpOnly:true,
      });

      var signed_cookie = params._res.get('set-cookie');

      //put the signed cookie in response, also
      return {'cookie':signed_cookie,'instructions':
      'please put this cookie in request header for api access'};
    })
  },
  requiredParams:{
    username:String,
    password:String,
  },
}

table.userLogout = {
  operation:function(params){
    var data = {}

    data.user = undefined
    params._res.cookie('userinfo',{info:'nkc_logged_out'},{
      signed:true,
      expires:(new Date(Date.now()-86400000)),
    });

    var signed_cookie = params._res.get('set-cookie');

    //put the signed cookie in response, also
    Object.assign(data, {'cookie':signed_cookie,'instructions':
    'you have logged out. you may replace existing cookie with this one'})

    return data;
  },
}

function newPasswordObject(plain){
  var salt = Math.floor((Math.random()*65536)).toString(16)
  var hash = sha256HMAC(plain,salt)

  var pwobj = {
    hashtype:'sha256HMAC',

    password:{
      hash:hash,
      salt:salt,
    },
  }

  return pwobj
}

table.changePassword = {
  operation:function(params){
    regex_validation.validate({
      password:params.newpassword
    })

    if(params.newpassword!==params.newpassword2)throw '两次密码不一致'

    var psnl = new layer.Personal(params.user._key)
    return psnl.load()
    .then(psnl=>{
      testPassword(params.oldpassword,psnl.model.hashtype,psnl.model.password)

      var pwobj = newPasswordObject(params.newpassword)

      return psnl.update(pwobj)
      .then(psnl=>{
        return 'done'
      })
    })

  },
  requiredParams:{
    oldpassword:String,
    newpassword:String,
    newpassword2:String,
  }
}
