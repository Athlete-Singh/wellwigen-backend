import mongoose from 'mongoose';
import fs from 'fs';
mongoose.connect('mongodb://localhost:27017/snapnfit').then(async () => {
  const db = mongoose.connection.db;
  const user = await db.collection('users').findOne({});
  const sub = await db.collection('subscriptions').findOne({});
  const data = { userId: user?._id, subId: sub?._id };
  fs.writeFileSync('scratch/db_info.json', JSON.stringify(data));
  process.exit(0);
});
