# Air Quality Dashboard (HTML, CSS, JavaScript)

A real-time Air Quality Index (AQI) dashboard featuring a semi-circular speedometer gauge, health index legend, live status monitoring, and historical records list.

## Features
- **Speedometer Gauge**: Scaled from 0 to 300 AQI with smooth animated needle rotation and counter animation.
- **6 Standard AQI Categories**:
  - `0–50`: Good (Green)
  - `51–100`: Moderate (Yellow)
  - `101–150`: Unhealthy for Sensitive Groups (Orange)
  - `151–200`: Unhealthy (Red)
  - `201–250`: Very Unhealthy (Purple)
  - `251–300`: Very Hazardous (Maroon)
- **Active Category Highlight**: Automatically highlights the current status on the legend list and displays actionable health recommendations.
- **Live Auto-Refresh**: Automatically checks for new measurements every 5 minutes (and immediately upon clicking "Refresh") with automatic detection of new sensor records.
- **Recent AQI Records Table**: Connects to the history endpoint with 10-item pagination, status badges, and localized timestamps.

---

## API Endpoints Used

1. **Latest AQI Measurement**:
   ```
   GET https://yachu.baliyoventures.com/api/aqi/latest/
   ```
   **Response Schema**:
   ```json
   {
     "id": 5,
     "aqi": "100",
     "dateTime": "2026-10-12T15:58:00+05:45"
   }
   ```

2. **AQI Historical Records**:
   ```
   GET https://yachu.baliyoventures.com/api/aqi/
   ```
   **Response Schema**:
   ```json
   {
     "count": 5,
     "next": null,
     "previous": null,
     "results": [
       {
         "id": 5,
         "aqi": "100",
         "dateTime": "2026-10-12T15:58:00+05:45"
       },
       ...
     ]
   }
   ```

---

## Project Structure

```
aqi/
├── index.html     # HTML structure with SVG speedometer gauge and history table
├── style.css      # CSS styling, color schemes, animations, and responsive layout
├── app.js         # JavaScript for API fetching, angle math, animations & DOM updates
└── README.md      # Documentation
```

---

## Running Locally

Run any static HTTP server in the project folder:

```bash
# Using Python
python3 -m http.server 8080

# Or using Node.js / npx
npx serve .
```

Then open [http://localhost:8080](http://localhost:8080) in your web browser.
