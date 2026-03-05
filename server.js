const express = require("express");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const errorHandler = require("./middleware/error");
const connectDB = require("./config/db");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit"); // import ratelimit
const cors = require("cors");
const Sentry = require("@sentry/node");
const Treblle = require("@treblle/express");

// Load env vars
dotenv.config({ path: "./config/config.env" });

// Connect to database
connectDB();

const app = express();

// configure sentry to capture logs
Sentry.init({
  dsn: process.env.sentry_DSN,
  integrations: [
    // enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // enable express.js middleware testing
    new Sentry.Integrations.Express({ app }),
  ],
  // Performance Monitoring
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
});

// Define a rate limiter middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs (increased for local dev)
  message: "Too many requests from this IP, please try again later.",
});

// imported routes
// const auth = require('./route/auth')
const HomeRouter = require("./route");
const superAdminRouter = require("./route/superadmin");
const NotFoundRouter = require("./route/404");
const staffRouter = require("./route/staff");
const announcementRouter = require("./route/announcement");
const classRouter = require("./route/class");
const subjectRouter = require("./route/subject");
const timeTableRouter = require("./route/timetable");
const sessionRouter = require("./route/session");
const studentRouter = require("./route/student");
const parentRouter = require("./route/parent");
const gradeRouter = require("./route/grade");
const inventoryRouter = require("./route/inventory");
const feeRouter = require("./route/fee.js");
const resultRouter = require('./route/result.js')
const assessmentRouter = require("./route/assessment.js");

// middlewares
app.use(Treblle({
  apiKey: process.env.treblle_apiKey,
  projectId: process.env.treblle_projectId
}))
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler()); // TracingHandler creates a trace for every incoming request

// Trust the first proxy in front of the application
app.set("trust proxy", 1);
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser(process.env.COOKIE_PARSER_SECRET));
app.use(helmet());
app.use(limiter); // Apply the rate limiter to all requests

app.use("/", HomeRouter);
app.use("/superadmin", superAdminRouter);
app.use("/staff", staffRouter);
app.use("/announcement", announcementRouter);
app.use("/class", classRouter);
app.use("/subject", subjectRouter);
app.use("/timetable", timeTableRouter);
app.use("/session", sessionRouter);
app.use("/student", studentRouter);
app.use("/parent", parentRouter);
app.use("/grade", gradeRouter);
app.use("/inventory", inventoryRouter);
app.use("/fee", feeRouter);
app.use('/result',resultRouter)
app.use("/assessment", assessmentRouter);


// debug route
app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});

// 404 route
app.use("*" || "*/*", NotFoundRouter);

app.use(Sentry.Handlers.errorHandler());
app.use(errorHandler);

PORT = process.env.PORT;
app.listen(5002, () => {
  console.log(`server is on ${PORT} `);
});