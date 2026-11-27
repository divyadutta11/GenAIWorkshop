# WattWise AI — Personalized Energy Advisory & Scenario Simulator

A responsive full-stack AI energy advisory web application where customers upload or connect smart-meter consumption data, explore consumption pattern visualizations, receive AI-generated personalized energy-saving recommendations, interactively simulate usage changes with 12-month impact forecasts, and chat with a context-aware energy assistant.

## Features
- **Consumption Pattern Visualization**: 24-hour load profile with Time-of-Use (TOU) peak zone highlighting, 30-day consumption & anomaly detection timeline, and AI-inferred end-use disaggregation.
- **Data Upload & Utility API Automation**: Drag-and-drop CSV/JSON upload (plus downloadable 14-day sample CSV), simulated Utility API connectors (Green Button ESPI, Octopus Energy, PG&E Share My Data, Tata Power Smart Grid), configurable sync cadence, 4-stage pipeline status, and execution logs.
- **AI Personalized Recommendations**: Quantified monthly kWh, bill (\$), and CO₂e savings with confidence scores, one-click **Apply to Simulator**, and helpfulness voting.
- **Interactive Scenario Simulator & 12-Month Forecast**: Adjust thermostat setback, off-peak load shifting, standby baseload cuts, LED/eco-appliance mode, rooftop solar PV, home battery storage, and tariff plans with instant 24-hour and 12-month projections.
- **AI Energy Assistant Chat**: Context-aware conversational advisor grounded in live telemetry and active simulator state (with optional Gemini API key configuration).
- **Success Measurement**: Tracks projected/realized kWh & cost savings alongside recommendation/chat helpfulness votes and 1–5 star CSAT feedback.

## Quick Start

```bash
node server/index.mjs
```

Then open `http://localhost:3456` in your browser.

To run the automated smoke tests:

```bash
node --test test/smoke.test.mjs
```
