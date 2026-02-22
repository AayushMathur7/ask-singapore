# Ask Singapore — Spec Doc

## What It Is
An interactive web app where you type a question and 148,000 synthetic Singaporeans answer. Responses are plotted on a map of Singapore by planning area, color-coded by sentiment.

Built on NVIDIA's Nemotron-Personas-Singapore dataset (888K personas, 55 planning areas, 38 fields per record).

## Why
- LinkedIn authority builder: "I built a tool that lets you run a focus group of 148K Singaporeans in 10 seconds"
- Teaches non-technical people about synthetic data, AI personas, and market research
- Shareable, visual, fun

## Stack
- **React** (Vite)
- **react-map-gl** (Mapbox GL wrapper for React)
- **Tailwind CSS**
- **OpenAI API** (or any LLM — Claude, Gemini, whatever)
- **Singapore planning areas GeoJSON** (from data.gov.sg)
- **NVIDIA Nemotron-Personas-Singapore dataset** (Hugging Face, CC BY 4.0)

## Data
- Dataset: https://huggingface.co/datasets/nvidia/Nemotron-Personas-Singapore
- 148,000 records, each with 6 persona types (professional, sports, arts, travel, food, general)
- 38 fields per record: name, age, gender, occupation, planning area, education, marital status, skills, hobbies, goals, cultural background
- GeoJSON: Singapore 55 planning areas boundaries (data.gov.sg or GitHub)

## Pages / Views

### 1. Map View (Main)
- Full-screen Singapore map (Mapbox)
- 55 planning areas rendered as polygons
- Default state: areas colored by population density or dominant occupation
- Search/question bar at the top (fixed)
- Sidebar or bottom panel for responses

### 2. Question Flow
User types a question → app does this:
1. Sample 15-20 personas across different planning areas (ensure demographic diversity: age, gender, job, area)
2. Send each persona + question to LLM in parallel
3. Run a simple sentiment classification on each response (positive / neutral / negative)
4. Color each planning area on the map by average sentiment (green → yellow → red)
5. Display individual persona responses in a panel

### 3. Response Panel
- Cards showing each persona's response:
  - Name, age, job, planning area
  - Their response (2-3 sentences)
  - Sentiment badge (positive/neutral/negative)
- Summary bar at top: "12/15 positive, main concern: cost"

### 4. Area Detail (Click a Planning Area)
- Click a colored area on the map
- See all personas from that area
- Demographics breakdown (age distribution, top occupations)
- Their specific responses to the current question

## Components

```
App
├── MapView (react-map-gl)
│   ├── PlanningAreaLayer (GeoJSON polygons, colored by sentiment)
│   └── AreaPopup (hover/click to see area name + summary)
├── QuestionBar (input + submit)
├── ResponsePanel (sidebar or bottom drawer)
│   ├── SummaryBar (sentiment breakdown)
│   └── PersonaCard[] (individual responses)
├── AreaDetail (modal or slide-in on area click)
│   ├── DemographicsChart
│   └── PersonaCard[]
└── LoadingState (while LLM calls are running)
```

## Data Flow

```
1. On load:
   - Fetch/load GeoJSON (planning area boundaries)
   - Load persona dataset (pre-processed JSON, ~148K records)
   - Render map with default coloring

2. On question submit:
   - Sample 15-20 personas (stratified by planning area + demographics)
   - For each persona, build a system prompt:
     "You are [name], a [age]-year-old [occupation] living in [area].
      Background: [cultural context]
      Skills: [skills]
      Hobbies: [hobbies]
      Goals: [goals]
      Respond naturally as this person would. Keep it to 2-3 sentences.
      Be authentic to your demographic and background."
   - Send all requests in parallel to LLM API
   - Classify sentiment of each response
   - Update map colors by area
   - Display responses in panel

3. On area click:
   - Filter personas by planning area
   - Show demographics + responses for that area
```

## Prompt Template

```
System: You are {name}, a {age}-year-old {gender} {occupation} living in {planning_area}, Singapore.

Education: {education}
Marital status: {marital_status}
Cultural background: {cultural_context}
Skills: {skills}
Hobbies: {hobbies}
Life goals: {goals}

Respond to the following question as yourself. Be natural, authentic, and brief (2-3 sentences). Your response should reflect your background, values, and life experience. Don't break character.

User: {question}
```

## Sentiment Classification
Keep it simple. Either:
- Ask the LLM to append a sentiment tag in the same call (cheaper)
- Or use a simple keyword/rule-based classifier
- 3 buckets: positive, neutral, negative
- Color mapping: green (#22c55e) → yellow (#eab308) → red (#ef4444)

## Dataset Pre-processing
The raw dataset is big. Pre-process it:
1. Download from Hugging Face
2. Parse into a clean JSON: one object per record with the key fields
3. Index by planning_area for fast sampling
4. Either bundle as a static JSON (if small enough after trimming) or host on a simple API/CDN
5. You probably only need: name, age, gender, occupation, planning_area, education, cultural_context, skills, hobbies, goals — drop the rest

## API Key Handling
- Don't expose OpenAI key in the client
- Use a simple serverless function (Vercel API route, Cloudflare Worker, or Next.js API route if you switch from Vite)
- Or just use Vite + a tiny Express backend
- For demo/MVP: environment variable is fine, you can lock it down later

## Deployment
- **Vercel** (free, easy, works with React/Vite)
- Custom domain if you want (asksingapore.ai or similar)

## MVP Scope (Build Today)
- [ ] Map rendering with 55 planning areas
- [ ] Question input bar
- [ ] Sample 10-15 personas on submit
- [ ] LLM responses displayed in cards
- [ ] Map colored by sentiment
- [ ] Click area to see detail

## Nice-to-Have (V2)
- Slider to control sample size (10 → 50 → 100 personas)
- Filter by demographic before asking (e.g., "only ask people aged 20-30")
- History of past questions
- Share link for a specific question + results
- Comparison mode: ask the same question to two different demographics
- Export results as PDF/image for LinkedIn posts
