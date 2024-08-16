const express = require('express');
const bodyParser = require('body-parser');
const sceneRoutes = require('./routes/sceneRoutes');

const app = express();

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use('/scenes', sceneRoutes);

app.set('view engine', 'ejs');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
