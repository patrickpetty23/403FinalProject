// Authors: Pierce Walker, Nathan Moore, Traeden Overly, Patrick Petty
const express = require("express");
const bodyParser = require("body-parser");
const { platform } = require("os");
const session = require("express-session");
let path = require("path");  

let app = express();

const { render } = require("ejs");

const port = process.env.PORT || 3000;

app.set("view engine", "ejs");

app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(session({ secret: 'ThisIsAPassword', resave: false, saveUninitialized: true }));
app.use(express.static('public'));

// Connect to postgres database
const knex = require("knex")({
    client: "pg",
    connection: {
        host : process.env.RDS_HOSTNAME || "localhost",
        user : process.env.RDS_USERNAME || "postgres",
        password : process.env.RDS_PASSWORD || "admin",
        database : process.env.RDS_DB_NAME || "final_project",
        port : process.env.RDS_PORT || 5432,
        ssl: process.env.DB_SSL ? {rejectUnauthorized: false} : false
    }
}); 

// function to allow access to blocked pages if someone is logged in
function checkLoggedIn (req, res, next) {
    let loginMessage = "You need to login to view that page."
    if (req.session.loggedIn) {
        next();
    } else {
        res.render("login", { loginMessage: loginMessage, loggedIn: req.session.loggedIn });
    }  
}

// default route to display landing page
app.get("/", (req, res) => {
    res.render("index", {loggedIn : req.session.loggedIn});

});

// route to display create.ejs
app.get("/create", checkLoggedIn, (req, res) => {
    let errorMessage = null;
    let successMessage = null;
    let loggedInUsername = req.session.username;

    if(loggedInUsername === "admin"){
        res.render("create", {errorMessage, successMessage, loggedIn: req.session.loggedIn});
    }
    else{
        res.render("login", {loggedIn: req.session.loggedIn});
    }
});

app.post('/create', async (req, res) => {
    const { username, password, confirmPassword } = req.body;
    let errorMessage = null;

    // Check if the username already exists
    const dbUser = await knex("logins").select().where('username', '=', username);

    if (dbUser.length > 0) {
        // Username already exists
        errorMessage = 'That username is already being used';
    } else {
        // Continue with the user creation logic
        if (password !== confirmPassword) {
            errorMessage = 'Passwords need to match';
        } else {
            await knex("logins").insert({ username: username, password: password });
            // Redirect to the account page after successful user creation
            return res.redirect('/account');
        }
    }
    // Render the create page with the appropriate messages
    res.render('create', { errorMessage, loggedIn: req.session.loggedIn });
});

// route to display services.ejs
app.get("/services", async (req,res) => {
    try {
        let selected_interest = null;
        let interests = null;
        let events = null;
        if (req.query.interest) {
            selected_interest = req.query.interest;
            let interest_id = null;
            if (selected_interest == "youngchildren") {
                interest_id = 1;
            } else if (selected_interest == "youth") {
                interest_id = 2;
            } else if (selected_interest == "elderly") {
                interest_id = 3;
            } else if (selected_interest == "specialneeds") {
                interest_id = 4;
            } else {
                res.send("It didn't work");
            }
            console.log("selected_interest: ", selected_interest);
            console.log("interest_id: ", interest_id);
            interests = await knex('interests').select().where('interest_id', '=', interest_id);
            events = await knex('events').select().where('interest_id', '=', interest_id);
        }
        // Render the "services" template with the retrieved data
        res.render("services", { loggedIn: req.session.loggedIn, interests: interests, events: events, selected_interest: selected_interest });
    } catch (error) {
        console.error('Error executing the queries:', error);
        res.status(500).send('Internal Server Error');
    }
});

// route to display the login page
app.get("/login", (req,res) => {
    let loginMessage = null;
    res.render("login", { loginMessage: loginMessage, loggedIn: req.session.loggedIn });
});

// route to log the user in and send them to data.ejs or display an error message if they put the wrong username or password
app.post("/login", async (req, res) => {
    let loginMessage = null;
    if (req.session.loggedIn) {
        loginMessage = "You are already logged in.";
        res.render("login", { loginMessage: loginMessage, loggedIn: req.session.loggedIn })
    } else {
        const { username, password } = req.body;
        const dbUser = await knex("logins").select().where("username", username).first();
        if (!dbUser) {
            loginMessage = "Incorrect username."
            return res.render("login", { loginMessage: loginMessage, loggedIn: req.session.loggedIn });
        }
        try {
            if (password === dbUser.password) {
                req.session.loggedIn = true;
                req.session.username = username;
                res.redirect("data");
            } else {
                loginMessage = "Incorrect password."
                res.render("login", { loginMessage: loginMessage, loggedIn: req.session.loggedIn });
            }
        } catch (error) {
            console.error('Login error:', error.message);
            res.status(500).send();
        }
    }
});

// route to logout the user
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect("/");
    })
});

// route to render account.ejs, but only when the user is logged in (using the checkLoggedIn function)
app.get("/account", checkLoggedIn, (req, res) => {
    tempusername = req.session.username
    if (tempusername === "admin") {
        // Display all data for the admin
        knex.select().from("logins").then(user => {
            res.render("account", { dbUser : user, loggedIn: req.session.loggedIn, loggedInUsername: req.session.username });
        });
    } else {
        // Display data only for the specific username
        knex.select().from("logins").where("username", tempusername).then(user => {
            res.render("account", { dbUser : user, loggedIn: req.session.loggedIn, loggedInUsername: req.session.username });
        });
    }
});

app.get("/edituser", checkLoggedIn, (req, res) => {

    let currentUsername = req.query.editusername;
  
    // Fetch the current user's information
    knex.select().from("logins").where("username", "=", currentUsername)
      .then(user => {
        res.render("edituser", { currentUsername: currentUsername, currentUser: user[0], loggedIn: req.session.loggedIn, loggedInUsername: req.session.username });
    })
      .catch(error => {
        // Handle error
        console.error(error);
        res.status(500).send("Internal Server Error");
    });
});  

// update user username and password
app.post("/updateuser", (req, res) => {
    let currentUsername = req.body.currentUsername;
    let newUsername = req.body.newUsername;
    let newPassword = req.body.newPassword;
  
    // Define an object to store the fields to be updated
    let updateFields = {};
  
    // Check if a new username is provided
    if (newUsername && newUsername.trim() !== "") {
      updateFields.username = newUsername;
    }
  
    // Check if a new password is provided
    if (newPassword && newPassword.trim() !== "") {
      updateFields.password = newPassword;
    }
  
    // Update the user's information in the database
    knex("logins")
      .where("username", "=", currentUsername)
      .update(updateFields)
      .then(() => {
        res.redirect("/account"); // Redirect to the home page or another appropriate location
      })
      .catch(error => {
        // Handle error
        console.error(error);
        res.status(500).send("Internal Server Error");
      });
  });   

  app.post("/deleteuser", (req, res) => {
    let deleteUsername = req.body.deleteusername;
    let currentUsername = req.session.username;

    knex("logins")
        .where("username", "=", deleteUsername)
        .delete()
        .then(() => {
            // Check if the deleted account is the one logged in
            if (currentUsername === deleteUsername) {
                res.redirect("/logout"); // Redirect to the login page
            } else {
                res.redirect("account"); // Redirect to the home page or another appropriate location
            }
        })
        .catch(error => {
            // Handle error
            console.error(error);
            res.status(500).send("Internal Server Error");
        });
  });

// route to render data.ejs with a table of all the customer leads submitted
app.get("/data", checkLoggedIn, async (req, res) => {
    try {
        // Fetch all customer data
        const leadData = await knex.select().from("leads");
        const uniqueInterest = await knex.distinct("interest").from("leads");

        // Render the data.ejs template with the customer data
        res.render("data", {
            leads: leadData,
            uniqueInterest: uniqueInterest,
            loggedIn: req.session.loggedIn
        });
    } catch (error) {
        console.error('Error fetching customer data:', error);
        res.send('Internal Server Error (Likely the database not communicating with the server)');
    }
});



// route to show only the selected survey results
app.get("/datafiltered", async (req, res) => {
    try {
        const leadInterest = req.query.interest;
        
        // Fetch distinct survey numbers (for dropdown)
        const distinctInterests = await knex('leads').distinct('interest').orderBy('interest');

        // Extract unique interests from the result
        const dropdownOptions = distinctInterests.map(item => item.interest);

        // Fetch all survey data
        let leadData;
        if (leadInterest) {
            leadData = await knex.select().from("leads").where("leads.interest", '=', leadInterest);
        } else {
            leadData = await knex.select().from("leads");
        }

        // Render the data.ejs template with the filtered survey data and dropdown options
        res.render("data", {
            leads: leadData,
            loggedIn: req.session.loggedIn,
            dropdownOptions: dropdownOptions
        });
    } catch (error) {
        console.error('Error executing the query:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get("/ourteam", (req,res) => {
    res.render('ourteam', {loggedIn: req.session.loggedIn})
})

app.post("/addcustomer", async (req, res) => {
    const { firstname, lastname, email, phone, interest } = req.body;
    const currentTimestamp = new Date();
    const targetTimezone = 'en-US';
    const formattedTimestamp = currentTimestamp.toLocaleString(targetTimezone, {
    timeZone: 'America/Denver', // Use 'America/Denver' for Mountain Time Zone
    month: 'numeric',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    })

    try {
        // Insert into the "leads" table
        await knex('leads').insert({
            first_name: firstname,
            last_name: lastname,
            email: email,
            phone: phone,
            interest: interest,
            date: formattedTimestamp
            // You can add more fields or modify as needed
        });

        // Redirect to the desired page
        res.redirect('/services');
    } catch (error) {
        console.error("Error inserting into the database:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(port, () => console.log("Server is running"));