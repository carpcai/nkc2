module.paths.push(__projectroot + 'nkc_modules'); //enable require-ment for this path

var moment = require('moment')
var path = require('path')
var fs = require('fs.extra')
var settings = require('server_settings.js');
var helper_mod = require('helper.js')();
var queryfunc = require('query_functions')
var AQL = queryfunc.AQL

var layer = require('../layer')

var table = {};
module.exports = table;

table.moveThread = {
  operation:function(params){
    //check if fid exists
    var po = params.permittedOperations

    var fid = params.fid
    var tid = params.tid
    var thread = new layer.Thread(tid)
    var destforum = new layer.Forum(fid)
    var origforum

    return thread.load()
    .then(thread=>{
      origforum = new layer.Forum(thread.model.fid)
      return origforum.load()
    })
    .then(origforum=>{
      return origforum.inheritPropertyFromParent()
    })
    .then(origforum=>{
      if(po['moveAllThreads']){
        return
      }
      //else we have to check: do you own the original forum?
      return origforum.testModerator(params.user.username)
    })
    .then(()=>{
      return destforum.load()
    })
    .then(destforum=>{
      //test existence
      return thread.update({fid})
    })
    .then(thread=>{
      return `successfully moved ${tid} to ${fid}`
    })
  },
  requiredParams:{
    tid:String,
    fid:String,
  },
  testPermission:function(params){
    //get original fid of given tid, and check if user is moderator to fid.
    //if(getThread(params.tid).owner.indexOf(params.user)<0) return Promise.reject('you cant move that')

    return 0;
  },
}

table.disablePost = {
  operation:function(params){
    var pid = params.pid
    var post = new layer.Post(pid)
    var po = params.permittedOperations

    return post.load()
    .then(post=>{
      return post.loadForum()
    })
    .then(origforum=>{
      if(po['toggleAllPosts']){
        return
      }
      //else we have to check: do you own the original forum?
      return origforum.testModerator(params.user.username)
    })
    .then(()=>{
      return post.update({disabled:true})
    })
  },
  requiredParams:{
    pid:String,
  },
  testPermission:function(params){
    return 0;
  },
}

table.enablePost = {
  operation:function(params){
    var pid = params.pid
    var post = new layer.Post(pid)
    var po = params.permittedOperations

    return post.load()
    .then(post=>{
      return post.loadForum()
    })
    .then(origforum=>{
      if(po['toggleAllPosts']){
        return
      }
      //else we have to check: do you own the original forum?
      return origforum.testModerator(params.user.username)
    })
    .then(()=>{
      return post.update({disabled:null})
    })
  },
  requiredParams:{
    pid:String,
  },
  testPermission:function(params){
    return 0;
  },
}

table.addThreadToCart={
  operation:function(params){
    var uid = params.user._key
    var tid = params.tid.toString()
    return AQL(`
      let u = document(users,@uid)
      update u with { cart:SLICE(UNIQUE(PUSH(u.cart,@cid)),-30) } in users
      `,{
        uid:uid,
        cid:'threads/'+tid,
      }
    )
  },
  requiredParams:{
    tid:String,
  }
}

table.addPostToCart={
  operation:function(params){
    var uid = params.user._key
    var pid = params.pid.toString()
    return AQL(`
      let u = document(users,@uid)
      update u with { cart:SLICE(UNIQUE(PUSH(u.cart,@cid)),-30) } in users
      `,{
        uid:uid,
        cid:'posts/'+pid,
      }
    )
  },
  requiredParams:{
    pid:String,
  }
}

table.listCart={
  operation:function(params){
    var cart = params.user.cart?params.user.cart:[];
    return AQL(
      `
      for i in @cart
      let c = document(i)
      filter c != null
      let oc = document(posts,c.oc)
      return merge(c,{oc})
      `
      ,{
        cart,
      }
    )
  },
}

table.clearCart={
  operation:function(params){
    var uid = params.user._key
    return queryfunc.doc_update(uid,'users',{cart:[]})
  }
}

table.setDigest={
  operation:function(params){
    var tid = params.tid
    var thread = new layer.Thread(tid)
    var po = params.permittedOperations

    return thread.load()
    .then(thread=>{
      return thread.loadForum()
    })
    .then(origforum=>{
      if(po['toggleDigestAllThreads']){
        return
      }

      //else we have to check: do you own the original forum?
      return origforum.testModerator(params.user.username)
    })
    .then(()=>{
      return thread.update({digest:thread.model.digest?null:true})
    })
    .then(()=>{
      return {message:thread.model.digest?'设为精华':'撤销精华'}
    })
  },
  requiredParams:{
    tid:String,
  }
}

table.setTopped={
  operation:function(params){
    var tid = params.tid
    var thread = new layer.Thread(tid)
    var po = params.permittedOperations

    return thread.load()
    .then(thread=>{
      return thread.loadForum()
    })
    .then(origforum=>{
      if(po['toggleToppedAllThreads']){
        return
      }

      //else we have to check: do you own the original forum?
      return origforum.testModerator(params.user.username)
    })
    .then(()=>{
      return thread.update({topped:thread.model.topped?null:true})
    })
    .then(()=>{
      return {message:thread.model.topped?'设为置顶':'撤销置顶'}
    })
  },
  requiredParams:{
    tid:String,
  }
}
