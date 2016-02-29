//api functions
module.paths.push('./nkc_modules'); //enable require-ment for this path

var moment = require('moment');

var settings = require('server_settings.js');
var helper_mod = require('helper.js')();
var bodyParser = require('body-parser');

var async = require('async');

var db = require('arangojs')(settings.arango.address);
db.useDatabase('testdb');
var testdata = db.collection('testdata');

var express = require('express');
var api = express.Router();

var validation = require('validation');
var queryfunc = require('query_functions');

exports.get_new_pid = function(callback){
  queryfunc.incr_counter('posts',callback);
};

exports.get_new_tid = function(callback){
  queryfunc.incr_counter('threads',callback);
};

exports.get_new_fid = function(callback){
  queryfunc.incr_counter('forums',callback);
};

exports.get_new_uid = function(callback){
  queryfunc.incr_counter('users',callback);
};

exports.get_new_rid = function(callback){
  queryfunc.incr_counter('resources',callback);
};

//post to a given thread.
exports.post_to_thread = function(post,tid,callback,isFirst){
  //check existence
  exports.exists(tid,'threads',(err,th)=>{
    if(err){
      callback(err);
      return;
    }
    //th is the thread object now

    //apply for a new pid
    exports.get_new_pid((err,newpid) =>{
      if(err)callback(err,null);else
      {
        //create a new post
        var timestamp = Date.now();
        var newpost = { //accept only listed attribute
          _key:newpid,
          tid:tid,
          toc:timestamp,
          tlm:timestamp,
          c:post.c,
          t:post.t,
          l:post.l,
          uid:post.uid,
          username:post.username,
        };

        //insert the new post into posts collection
        queryfunc.doc_save(newpost,'posts',(err,back)=>{
          if(err)callback(err);else{
            callback(null,tid);
            //okay to respond the user

            //update thread object to make sync
            queryfunc.update_thread(tid);
          }
        });
      }
    });
  });
};

//post to a forum, generating new threads.
exports.post_to_forum = function(post,fid,callback){
  //check existence
  exports.exists(fid,'forums',function(err,fo){
    if(err){callback(err);return;}
    //fo is the forum object now
    //obtain new tid
    exports.get_new_tid((err,newtid) =>
    {
      if(err)callback(err);else
      {

        //now we got brand new tid.

        //create a new thread
        var timestamp = Date.now();
        var newthread =
        {
          _key:newtid.toString(),//key must be string.
          fid:fid.toString(),
          toc:timestamp,
          tlm:timestamp,
        };

        //save this new thread
        queryfunc.doc_save(newthread,'threads',(err,result)=>
        {
          if(err)callback(err);else
          {
            //now post to the newly created thread.
            exports.post_to_thread(post,newtid,callback,true);
          };
        });
      };
    });
  });
};

//get post object from database
exports.get_a_post = (pid,callback)=>{
  queryfunc.doc_load(pid.toString(),'posts',callback);
};

//return a list of posts within a thread.
exports.get_post_from_thread = (params,callback)=>{
  queryfunc.doc_list({
    type:'posts',
    filter_by:'tid',
    equals:params.tid,
    sort_by:'toc',
    order:'asc',
    start:params.start,
    count:params.count
  },
  callback);
};

//get thread object from database.
exports.get_a_thread = (tid,callback)=>{
  queryfunc.doc_load(tid.toString(),'threads',callback);
};

//return a list of threads.
exports.get_threads_from_forum = (params,callback)=>{
  queryfunc.doc_list({
    type:'threads',
    filter_by:'fid',
    equals:params.fid,
    sort_by:'lm.tlm',
    order:'desc',
    start:params.start,
    count:params.count,
  },
  callback);
};

//get forum object.
exports.get_threads_from_forum_as_forum = (params,callback)=>{
  async.waterfall
  ([
    function(next){
      next(null,{});
    },
    function(result,next){
      queryfunc.doc_load(params.fid,'forums',(err,forum)=>{
        if(err){next(err);return;}
        result.forum = forum;
        next(null,result);
      });
    },
    function(result,next){
      exports.get_threads_from_forum(params,(err,threads)=>{
        if(err){next(err);return;}
        result.threads = threads;
        next(null,result);
      });
    }
  ],callback);
};

exports.get_posts_from_thread_as_thread = (params,callback)=>{
  async.waterfall
  ([
    function(next){
      next(null,{});
    },
    function(result,next){
      exports.get_a_thread(params.tid,(err,thread)=>{
        if(err){next(err);return;}
        result.thread = thread;
        next(null,result);
      });
    },
    function(result,next){
      exports.get_post_from_thread(params,(err,posts)=>{
        if(err){next(err);return;}
        result.posts = posts;
        next(null,result);
      });
    },
  ],
  callback);
};


//check if an entity exists/ is available
exports.exists = function(key,type,callback){
  queryfunc.doc_load(key,type,callback);
};

exports.get_user_by_name = (username,callback)=>{
  queryfunc.doc_list({
    type:'users',
    filter_by:'username',
    equals:username,
    sort_by:'username',
    order:'asc',
  },
  callback);
};

exports.get_user = (uid,callback)=>{
  queryfunc.doc_load(uid,'users',callback);
};

function user_exist_by_name(username,callback){
  exports.get_user_by_name(username,(err,back)=>{
    if(err){
      callback(err);
    }
    else{
      if(back.length==0){
        callback(null,false);//user not exist
      }else{
        callback(null,true);//user does exist
      }
    }
  });
};

//user creation
exports.create_user = function(user,callback){
  //check if user exists.
  user_exist_by_name(user.username,(err,back)=>{
    if(err)callback(err);else{
      if(back){
        //if user exists
        callback('user exists already');
      }else{
        //user not exist, create user now!
        //obtain an uid first...
        exports.get_new_uid((err,newuid)=>{
          if(err)callback(err);else{
            //construct the new user object
            user._key = newuid;
            var timestamp = Date.now();
            user.toc = timestamp;
            user.tlv = timestamp;
            user.certs = ['default'];//if not exist default to 'default'

            queryfunc.doc_save(user,'users',callback);
          }
        });
      }
    }
  });
}

//determine if given password matches the username
exports.verify_user = function(user,callback){
  exports.get_user_by_name(user.username,(err,back)=>{
    if(err)return callback(err);
    if(back.length===0)//user not exist
    return callback('user not exist by name');

    //if user exists
    if(back[0].password === user.password){
      callback(null,back[0]); // return the user
    }
    else {
      callback(null,false); //return false, indicating unmatch
    }
  });
}

exports.get_resources = function(key,callback){
  queryfunc.doc_load(key,'resources',callback);
}
