const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const databasePath = path.join(__dirname, "twitterClone.db");
const app = express();
module.exports = app;
app.use(express.json());

let db = null;
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const checkToken = (request, response, next) => {
  let token = null;
  const authHeader = request.headers["authorization"];
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    token = authHeader.split(" ")[1];
    if (token === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(token, "123456", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.userName;
          next();
        }
      });
    }
  }
};
app.post("/register/", async (request, response) => {
  const { name, username, password, gender } = request.body;
  const getUser = `
    SELECT
    *
    FROM
    user
    WHERE
    username='${username}';`;
  const dbUser = await db.get(getUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashPass = await bcrypt.hash(password, 10);
    const addUser = `
        INSERT INTO
        user (name,username,password,gender)
        VALUES
        ('${name}',
        '${username}',
        '${hashPass}',
        '${gender}');`;
    await db.run(addUser);
    response.send("User created successfully");
  }
});
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUser = `
    SELECT
    *
    FROM
    user
    WHERE
    username='${username}';`;
  const dbUser = await db.get(getUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else if (await bcrypt.compare(password, dbUser.password)) {
    const payload = {
      userName: username,
    };
    const jwtToken = jwt.sign(payload, "123456");
    response.send({ jwtToken });
  } else {
    response.status(400);
    response.send("Invalid password");
  }
});
app.get("/user/tweets/feed/", checkToken, async (request, response) => {
  const { username } = request;
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getTweets = `
  SELECT
  *
  FROM
  (follower INNER JOIN tweet 
  ON follower.following_user_Id=tweet.user_id) AS t
  NATURAL JOIN user
  WHERE
  follower_user_id=${userIs.user_id}
  ORDER BY
  date_time DESC
  LIMIT 4;`;
  const userFollowing = await db.all(getTweets);
  response.send(
    userFollowing.map((obj) => ({
      username: obj.username,
      tweet: obj.tweet,
      dateTime: obj.date_time,
    }))
  );
});
app.get("/user/following/", checkToken, async (request, response) => {
  const { username } = request;
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getFollowing = `
  SELECT
  *
  FROM
  follower INNER JOIN user  
  ON follower.following_user_id=user.user_id
  WHERE
  follower_user_id=${userIs.user_id};`;

  const userFollowing = await db.all(getFollowing);
  response.send(userFollowing.map((obj) => ({ name: obj.name })));
});

app.get("/user/followers/", checkToken, async (request, response) => {
  const { username } = request;
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getFollowing = `
  SELECT
  *
  FROM
  follower INNER JOIN user  
  ON follower.follower_user_id=user.user_id
  WHERE
  following_user_id=${userIs.user_id};`;
  const userFollowing = await db.all(getFollowing);
  response.send(userFollowing.map((obj) => ({ name: obj.name })));
});
app.get("/tweets/:tweetId/", checkToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getTweet = `
  SELECT
  * 
  FROM
  tweet
  WHERE
  tweet_id=${tweetId} and user_id IN (
    SELECT
    following_user_id
    FROM
    follower 
    WHERE
    follower_user_id=${userIs.user_id});`;
  const tweetIs = await db.get(getTweet);
  if (tweetIs === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweet = `
    SELECT
    tweet,
    (SELECT
    COUNT(like_id)
    FROM
    like
    WHERE
    tweet_id=${tweetId}) AS likes,
    (SELECT
    COUNT(reply_id)
    FROM
    reply
    WHERE
    tweet_id=${tweetId}) AS replies,
    date_time AS dateTime
    FROM 
    tweet 
    WHERE
    tweet.tweet_id=${tweetIs.tweet_id};`;
    response.send(await db.get(tweet));
  }
});
app.get("/tweets/:tweetId/likes/", checkToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  let out = [];
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getTweet = `
  SELECT
  * 
  FROM
  tweet
  WHERE
  tweet_id=${tweetId} and user_id IN (
    SELECT
    following_user_id
    FROM
    follower 
    WHERE
    follower_user_id=${userIs.user_id});`;
  const tweetIs = await db.get(getTweet);
  if (tweetIs === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const usersLiked = `
      SELECT
      username AS likes
      FROM
      like NATURAL JOIN user
      WHERE
      tweet_id=${tweetId};`;
    const nameArray = await db.all(usersLiked);
    nameArray.forEach((obj) => {
      out.push(obj.likes);
    });
    response.send({ likes: out });
  }
});
app.get("/tweets/:tweetId/replies/", checkToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getTweet = `
  SELECT
  * 
  FROM
  tweet
  WHERE
  tweet_id=${tweetId} and user_id IN (
    SELECT
    following_user_id
    FROM
    follower 
    WHERE
    follower_user_id=${userIs.user_id});`;
  const tweetIs = await db.get(getTweet);
  if (tweetIs === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const usersReply = `
      SELECT
      name,
      reply
      FROM
      reply NATURAL JOIN user
      WHERE
      tweet_id=${tweetId};`;
    const users = await db.all(usersReply);
    response.send({ replies: users });
  }
});
app.get("/user/tweets/", checkToken, async (request, response) => {
  const { username } = request;
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getUserTweets = `
  SELECT
    tweet,
    (SELECT
        COUNT(*) AS likes
    FROM 
    like
    WHERE like.tweet_id=tweet.tweet_id)AS likes,
    (
        SELECT
            COUNT(*) AS replies
        FROM
        reply
        WHERE
        reply.tweet_id=tweet.tweet_id
    ) AS replies,
    tweet.date_time AS dateTime
  FROM
  tweet 
  WHERE tweet.user_id=${userIs.user_id};`;
  response.send(await db.all(getUserTweets));
});
app.post("/user/tweets/", checkToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getTimeAndDate = `
  SELECT
  DATETIME() AS current;`;
  let currentDateTime = await db.get(getTimeAndDate);
  const createUser = `
  INSERT INTO
  tweet(tweet,user_id,date_time)
  VALUES(
      '${tweet}',
      ${userIs.user_id},
      '${currentDateTime.current}'
  )`;
  await db.run(createUser);
  response.send("Created a Tweet");
});
app.delete("/tweets/:tweetId/", checkToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUser = `
  SELECT
  *
  FROM
  user
  WHERE
  username='${username}'
  ;`;
  const userIs = await db.get(getUser);
  const getTweet = `
  SELECT
  tweet_id
  FROM
  tweet
  WHERE
  tweet_id=${tweetId} and user_id=${userIs.user_id};`;
  const tweetIs = await db.get(getTweet);
  if (tweetIs === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const del = `
      DELETE
      FROM
      tweet
      WHERE
      tweet_id=${tweetId};`;
    await db.run(del);
    response.send("Tweet Removed");
  }
});
