const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const firebase = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('./service-account');
const _ = require('lodash');

const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: 'https://facebook-event-aggregator.firebaseio.com'
});

async function getSchoolInfo(schoolName) {
  const response = await axios.get(
    `https://graph.facebook.com/v2.10/search?q=${schoolName}&type=page&fields=id,name,description,cover,category`,
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`
      }
    }
  );
  let pages = response.data.data;
  if (pages.length === 25) {
    for (let i = 0; i < 5; i++) {
      let cursor = response.data.paging.cursors.after;
      const nextResponse = await axios.get(
        `https://graph.facebook.com/v2.10/search?q=${schoolName}&type=page&after=${cursor}`,
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`
          }
        }
      );
      pages = [...pages, ...nextResponse.data.data];
    }
  }
  return pages.filter(page => {
    return (
      page.category === 'College & University' ||
      page.category === 'Medical School' ||
      page.category === 'School' ||
      page.category === 'Campus Building' ||
      page.category === 'Library' ||
      page.category === 'School Sports Team' ||
      page.category === 'Education' ||
      page.category === 'Religious Organization' ||
      page.category === 'Medical Research Center' ||
      page.category === 'Bookstore'
    );
  });
}

app.post('/relatePages', async (req, res) => {
  // Get the name of the school from the request body to search using FB API
  let { school, senderUid } = req.body;
  let schoolAlias;
  const schoolName = school.schoolName.toUpperCase();
  if (school.schoolAlias) {
    schoolAlias = school.schoolAlias;
  }
  const schoolNamePages = await getSchoolInfo(schoolName);
  let schoolAliasPages;
  if (schoolAlias) {
    schoolAliasPages = await getSchoolInfo(schoolAlias);
  }
  let schoolPages;
  if (schoolAliasPages) {
    schoolPages = [...schoolAliasPages, ...schoolNamePages];
  } else {
    schoolPages = [...schoolNamePages];
  }
  schoolPages = _.uniqBy(schoolPages, item => {
    return item.id;
  });
  const schoolRef = await firebase
    .database()
    .ref(`/schools`)
    .push({
      schoolName,
      schoolAlias,
      schoolPages
    });
  await firebase.database().ref(`/users/${senderUid}/school`).set(schoolRef.key);
  console.log(schoolPages);
  res.json({schoolId: schoolRef.key});
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('started on port', port);
});
