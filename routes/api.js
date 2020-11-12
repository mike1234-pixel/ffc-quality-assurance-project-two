// 'use strict';

const expect = require('chai').expect;
const mongodb = require('mongodb');
const mongoose = require('mongoose');
const XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
const dotenv = require('dotenv').config({ path: '../.env'});

module.exports = function (app) {

  // db connection
  mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false}).then((con) => {
    console.log("DB connection successful.");
  }).catch((err) => console.log(err));
  mongoose.set('debug', true);

  //schema
  const stockSchema = new mongoose.Schema({
    name: {type: String, required: true},
    likes: {type: Number, default: 0},
    ips: [String]
  })

  // model
  let Stock = mongoose.model(`Stock`, stockSchema);

  // route
  app.route('/api/stock-prices')
    .get(function (req, res){
      let responseObject = {};
      responseObject['stockData'] = {};

      // var to determine number of stocks 
      let twoStocks = false;

      // output response - convert responseObject to json
      let outputResponse = () => {
        try {
        return res.json(responseObject)
        } catch (err) {
          console.log(err)
        }
      }

      let findOrUpdateStock = (stockName, documentUpdate, nextStep) => {
         Stock.findOneAndUpdate(
              {name: stockName},
              documentUpdate,
              {new: true, upsert: true},
              (error, stockDocument) => {
                  if(error){
                  console.log(error)
                  }else if(!error && stockDocument){
                      if(twoStocks === false){
                        // for one stock
                        return nextStep(stockDocument, processOneStock)
                      } else {
                        // for two stocks
                        return nextStep(stockDocument, processTwoStocks)
                      }
                  }
              }
          )
      }

      let likeStock = (stockName, nextStep) => {
        Stock.findOne({name: stockName}, (error, stockDocument) => {
          if (!error && stockDocument && stockDocument['ips'] && stockDocument['ips'].includes(req.ip)) {
            return res.send("Error: Only 1 like per IP allowed")
          } else {
            let documentUpdate = {$inc: {likes: 1}, $push: {ips: req.ip}}
            nextStep(stockName, documentUpdate, getPrice)
          }
        })
      }

      let getPrice = (stockDocument, nextStep) => {
        try {
        let xhr = new XMLHttpRequest();

        let requestUrl = `https://stock-price-checker-proxy--freecodecamp.repl.co/v1/stock/${stockDocument['name']}/quote`;

        // 3rd argument here is to run asynchronously
        xhr.open('GET', requestUrl, true);
        xhr.onload = () => {

          let apiResponse = JSON.parse(xhr.responseText);
        
          // if apiResponse is undefined the app crashes
          stockDocument['price'] = apiResponse['latestPrice'].toFixed(2);
          nextStep(stockDocument, outputResponse)
        }
          xhr.send();
        } catch (err) {
          console.log(err)
        }
      }
    
    // build response for 1 stock
    let processOneStock = (stockDocument, nextStep) => {
      // set stock field of stockData obj equal to name field of stockDocument
      responseObject['stockData']['stock'] = stockDocument['name'];
      responseObject['stockData']['price'] = stockDocument['price'];
      responseObject['stockData']['likes'] = stockDocument['likes'];
      nextStep();
    }
    
    let stocks = []        
    // build response for 2 stocks
    let processTwoStocks = (stockDocument, nextStep) => {
        let newStock = {}
        newStock['stock'] = stockDocument['name']
        newStock['price'] = stockDocument['price']
        newStock['likes'] = stockDocument['likes']
        stocks.push(newStock)
        if(stocks.length === 2){
          stocks[0]['rel_likes'] = stocks[0]['likes'] - stocks[1]['likes']
          stocks[1]['rel_likes'] = stocks[1]['likes'] - stocks[0]['likes']
          responseObject['stockData'] = stocks
          nextStep()
        }else{
          return
        }
    }

		/* Process Input*/  
    if(typeof (req.query.stock) === 'string'){
      /* One Stock */
      // /api/stock-prices?stock=GOOG
      let stockName = req.query.stock;
      console.log(stockName);
      let documentUpdate = {};

      // check if likes param/field exists and is set to true
      if (req.query.like && req.query.like === 'true') {
        likeStock(stockName, findOrUpdateStock)
      } else {
      findOrUpdateStock(stockName, documentUpdate, getPrice)
      }

    } else if (Array.isArray(req.query.stock)){
      twoStocks = true
      // Stock 1 
        let stockName = req.query.stock[0]
        if(req.query.like && req.query.like === 'true'){
            likeStock(stockName, findOrUpdateStock)
        }else{
            let documentUpdate = {}
            findOrUpdateStock(stockName, documentUpdate, getPrice)
        }

        // Stock 2 
        stockName = req.query.stock[1]
        if(req.query.like && req.query.like === 'true'){
            likeStock(stockName, findOrUpdateStock)
        }else{
            let documentUpdate = {}
            findOrUpdateStock(stockName, documentUpdate, getPrice)
        }

    }
});
    
};
