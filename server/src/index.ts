import app from './app';
import { startExpiryScheduler } from './services/expiry.service';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startExpiryScheduler();
});
