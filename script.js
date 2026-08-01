let matchState = {
  currentInnings: 1,
  target: null,
  maxOvers: 20,
  isComplete: false,
  seriesScore: { 1: 0, 2: 0 },
  inningsBattingTeam: { 1: 1, 2: 2 }, 
  matchHistoryArchive: [], 
  teams: {
    1: { name: "", players: [] },
    2: { name: "", players: [] }
  },
  inningsData: {
    1: { totalRuns: 0, wickets: 0, totalBalls: 0, ballHistory: [], activeStrikerId: null, activeNonStrikerId: null, activeBowlerId: null, bowlingStats: {} },
    2: { totalRuns: 0, wickets: 0, totalBalls: 0, ballHistory: [], activeStrikerId: null, activeNonStrikerId: null, activeBowlerId: null, bowlingStats: {} }
  }
};
let actionHistory = [];
let pendingActionType = null;

// DOM Elements
const setupScreen = document.getElementById("setup-screen");
const matchScreen = document.getElementById("match-screen");
const runsModal = document.getElementById("runs-modal");
const oversModal = document.getElementById("overs-modal");
const oversLogContainer = document.getElementById("overs-log-container");
const playerSelectionModal = document.getElementById("player-selection-modal");
const scorecardModal = document.getElementById("scorecard-modal");
const tossModal = document.getElementById("toss-modal");
const removePlayerModal = document.getElementById("remove-player-modal");

// --- LOCAL STORAGE ---
function saveToLocalStorage() {
  localStorage.setItem("creasecount_matchState_v9", JSON.stringify(matchState));
  localStorage.setItem("creasecount_actionHistory_v9", JSON.stringify(actionHistory));
}

function loadFromLocalStorage() {
  const savedState = localStorage.getItem("creasecount_matchState_v9");
  const savedHistory = localStorage.getItem("creasecount_actionHistory_v9");
  
  if (savedState) {
    matchState = JSON.parse(savedState);
    actionHistory = savedHistory ? JSON.parse(savedHistory) : [];
    setupScreen.classList.add("hidden");
    matchScreen.classList.remove("hidden");
    renderScoreboard();
  } else {
    setupScreen.classList.remove("hidden");
    matchScreen.classList.add("hidden");
  }
}

function captureState() {
  actionHistory.push(JSON.parse(JSON.stringify(matchState)));
}

// --- DYNAMIC TEAM ROUTERS ---
function getBatTeamId(inn) { return matchState.inningsBattingTeam[inn]; }
function getBowlTeamId(inn) { return matchState.inningsBattingTeam[inn === 1 ? 2 : 1]; }

// --- SETUP SCREEN & PLAYER INPUT ROWS ---
document.getElementById("add-team1-player").addEventListener("click", () => addPlayerInput("team1-players"));
document.getElementById("add-team2-player").addEventListener("click", () => addPlayerInput("team2-players"));

function addPlayerInput(containerId) {
  const container = document.getElementById(containerId);
  const row = document.createElement("div");
  row.className = "player-input-row mt-1";
  
  const input = document.createElement("input");
  input.type = "text";
  input.className = "player-input";
  input.placeholder = `Player ${container.children.length + 1}`;
  input.required = true;
  
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-row-btn";
  removeBtn.innerText = "X";
  removeBtn.onclick = () => {
    if (container.children.length <= 2) {
      alert("A team must have at least 2 players configured.");
      return;
    }
    container.removeChild(row);
  };
  
  row.appendChild(input);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

document.getElementById("start-match-btn").addEventListener("click", () => {
  const t1Name = document.getElementById("team1-name").value || "Team 1";
  const t2Name = document.getElementById("team2-name").value || "Team 2";
  
  const t1Players = Array.from(document.getElementById("team1-players").children)
                         .map(row => row.querySelector("input"))
                         .filter(input => input && input.value.trim() !== "")
                         .map((input, idx) => ({ id: `t1_p${idx}`, name: input.value, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false }));
  
  const t2Players = Array.from(document.getElementById("team2-players").children)
                         .map(row => row.querySelector("input"))
                         .filter(input => input && input.value.trim() !== "")
                         .map((input, idx) => ({ id: `t2_p${idx}`, name: input.value, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false }));

  if (t1Players.length < 2 || t2Players.length < 2) {
    alert("Each team must have at least 2 players configured to start a match."); return;
  }

  captureState();
  matchState.teams[1].name = t1Name; matchState.teams[1].players = t1Players;
  matchState.teams[2].name = t2Name; matchState.teams[2].players = t2Players;
  
  document.getElementById("bat-first-t1-btn").innerText = t1Name;
  document.getElementById("bat-first-t2-btn").innerText = t2Name;
  tossModal.classList.remove("hidden");
});

// --- TOSS & BATTING ORDER LOGIC ---
function handleTossDecision(battingFirstTeamId) {
  const maxOversInput = parseInt(document.getElementById("toss-max-overs").value);
  if (!maxOversInput || maxOversInput < 1) {
    alert("Please enter a valid number of overs.");
    return;
  }

  captureState();
  matchState.maxOvers = maxOversInput;
  matchState.inningsBattingTeam[1] = battingFirstTeamId;
  matchState.inningsBattingTeam[2] = battingFirstTeamId === 1 ? 2 : 1;
  
  tossModal.classList.add("hidden");
  setupScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");
  saveToLocalStorage();
  
  kickoffInnings(1);
}

document.getElementById("bat-first-t1-btn").addEventListener("click", () => handleTossDecision(1));
document.getElementById("bat-first-t2-btn").addEventListener("click", () => handleTossDecision(2));

function kickoffInnings(inn) {
  promptForNewBatter("Select Striker", "Who is facing the first ball?", (strikerId) => {
    matchState.inningsData[inn].activeStrikerId = strikerId;
    promptForNewBatter("Select Non-Striker", "Who is at the other end?", (nonStrikerId) => {
      matchState.inningsData[inn].activeNonStrikerId = nonStrikerId;
      promptForNewBowler("Select Opening Bowler", "Who is bowling?", (bowlerId) => {
        matchState.inningsData[inn].activeBowlerId = bowlerId;
        renderScoreboard(); saveToLocalStorage();
      });
    });
  });
}

// --- MID-MATCH PLAYER INJECTION ---
document.getElementById("add-mid-player-btn").addEventListener("click", () => {
  const t1 = matchState.teams[1].name;
  const t2 = matchState.teams[2].name;
  const select = document.getElementById("mid-player-team");
  select.innerHTML = `<option value="1">${t1}</option><option value="2">${t2}</option>`;
  document.getElementById("mid-player-name").value = "";
  document.getElementById("add-player-modal").classList.remove("hidden");
});

document.getElementById("submit-mid-player-btn").addEventListener("click", () => {
  const teamId = parseInt(document.getElementById("mid-player-team").value);
  const playerName = document.getElementById("mid-player-name").value.trim();
  
  if (!playerName) { alert("Please enter a player name."); return; }
  
  captureState(); 
  const newPlayer = { id: `t${teamId}_p_${Date.now()}`, name: playerName, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false };
  matchState.teams[teamId].players.push(newPlayer);
  saveToLocalStorage();
  
  document.getElementById("add-player-modal").classList.add("hidden");
  alert(`${playerName} has been added to ${matchState.teams[teamId].name}!`);
});

document.getElementById("cancel-mid-player-btn").addEventListener("click", () => document.getElementById("add-player-modal").classList.add("hidden"));

// --- MID-MATCH PLAYER REMOVAL ---
document.getElementById("remove-mid-player-btn").addEventListener("click", () => {
  const inn = matchState.currentInnings;
  const activeData = matchState.inningsData[inn];
  
  const grid = document.getElementById("remove-player-grid");
  grid.innerHTML = "";

  [1, 2].forEach(teamId => {
    const team = matchState.teams[teamId];
    team.players.forEach(p => {
      const isActive = (p.id === activeData.activeStrikerId || p.id === activeData.activeNonStrikerId || p.id === activeData.activeBowlerId);
      
      const btn = document.createElement("button");
      btn.className = "btn secondary-btn";
      btn.innerText = `${p.name} (${team.name})${isActive ? ' [Active]' : ''}`;
      if (isActive) {
        btn.style.opacity = "0.5";
        btn.disabled = true;
      } else {
        btn.onclick = () => {
          if (team.players.length <= 2) {
            alert("Cannot remove player. Teams must maintain at least 2 players.");
            return;
          }
          captureState();
          matchState.teams[teamId].players = matchState.teams[teamId].players.filter(x => x.id !== p.id);
          saveToLocalStorage();
          removePlayerModal.classList.add("hidden");
          alert(`${p.name} was removed from the squad.`);
        };
      }
      grid.appendChild(btn);
    });
  });

  removePlayerModal.classList.remove("hidden");
});

document.getElementById("cancel-remove-player-btn").addEventListener("click", () => removePlayerModal.classList.add("hidden"));

// --- PLAYER SELECTION ---
function showSelectionModal(title, desc, options, callback) {
  document.getElementById("selection-title").innerText = title;
  document.getElementById("selection-desc").innerText = desc;
  const grid = document.getElementById("selection-grid");
  grid.innerHTML = "";
  
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "btn secondary-btn";
    btn.innerText = opt.name;
    btn.onclick = () => { playerSelectionModal.classList.add("hidden"); callback(opt.id); };
    grid.appendChild(btn);
  });
  playerSelectionModal.classList.remove("hidden");
}

function promptForNewBatter(title, desc, callback) {
  const inn = matchState.currentInnings;
  const teamId = getBatTeamId(inn);
  const data = matchState.inningsData[inn];
  const batters = matchState.teams[teamId].players.filter(p => !p.isOut && p.id !== data.activeStrikerId && p.id !== data.activeNonStrikerId);
  showSelectionModal(title, desc, batters, callback);
}

function promptForNewBowler(title, desc, callback) {
  const inn = matchState.currentInnings;
  const teamId = getBowlTeamId(inn);
  const data = matchState.inningsData[inn];
  const bowlers = matchState.teams[teamId].players.filter(p => p.id !== data.activeBowlerId); 
  showSelectionModal(title, desc, bowlers, (bowlerId) => {
    if (!matchState.inningsData[inn].bowlingStats[bowlerId]) matchState.inningsData[inn].bowlingStats[bowlerId] = { balls: 0, runs: 0, wickets: 0 };
    callback(bowlerId);
  });
}

// --- RETIRED HURT LOGIC ---
document.getElementById("retire-btn").addEventListener("click", () => {
  if (matchState.isComplete) return;
  const inn = matchState.currentInnings;
  const data = matchState.inningsData[inn];
  const battingTeam = matchState.teams[getBatTeamId(inn)];

  const striker = battingTeam.players.find(p => p.id === data.activeStrikerId);
  const nonStriker = battingTeam.players.find(p => p.id === data.activeNonStrikerId);

  const options = [];
  if (striker) options.push({ id: striker.id, name: striker.name + " (Striker)" });
  if (nonStriker) options.push({ id: nonStriker.id, name: nonStriker.name + " (Non-Striker)" });

  showSelectionModal("Retire Hurt", "Which batter is retiring?", options, (retiredId) => {
    promptForNewBatter("New Batter", "Who is coming in?", (newBatterId) => {
      captureState();
      if (data.activeStrikerId === retiredId) data.activeStrikerId = newBatterId;
      else if (data.activeNonStrikerId === retiredId) data.activeNonStrikerId = newBatterId;
      renderScoreboard();
      saveToLocalStorage();
    });
  });
});

// --- SCORING ENGINE ---
function handleScoreAction(runsToAdd, ballsCounted, isExtra = false, specialLabel = null) {
  if (matchState.isComplete) return;
  captureState();
  const inn = matchState.currentInnings;
  const data = matchState.inningsData[inn];
  const battingTeamId = getBatTeamId(inn);
  
  data.totalRuns += runsToAdd;
  data.totalBalls += ballsCounted;
  data.ballHistory.push({ runs: runsToAdd, ballsCounted: ballsCounted, label: specialLabel });

  if (!isExtra && data.activeStrikerId) {
    const striker = matchState.teams[battingTeamId].players.find(p => p.id === data.activeStrikerId);
    striker.runs += runsToAdd; striker.balls += ballsCounted;
    if (runsToAdd === 4) striker.fours += 1;
    if (runsToAdd === 6) striker.sixes += 1;
  }
  if (data.activeBowlerId) {
    data.bowlingStats[data.activeBowlerId].runs += runsToAdd;
    data.bowlingStats[data.activeBowlerId].balls += ballsCounted;
  }

  if (!isExtra && runsToAdd % 2 !== 0) {
    swapStrike();
  } else if (isExtra && (runsToAdd === 2 || runsToAdd === 4)) {
    swapStrike();
  }
  
  checkOverAndInningsEnd(ballsCounted);
}

function swapStrike() {
  const inn = matchState.currentInnings;
  const temp = matchState.inningsData[inn].activeStrikerId;
  matchState.inningsData[inn].activeStrikerId = matchState.inningsData[inn].activeNonStrikerId;
  matchState.inningsData[inn].activeNonStrikerId = temp;
}

document.getElementById("manual-swap-btn").addEventListener("click", () => {
  if (matchState.isComplete) return;
  captureState(); swapStrike(); renderScoreboard(); saveToLocalStorage();
});

function openRunsModal(type) {
  if (matchState.isComplete) return;
  pendingActionType = type;
  const desc = document.getElementById("modal-desc");
  const optionsContainer = document.getElementById("dynamic-runs-options");
  optionsContainer.innerHTML = ""; 

  if (type === 'out') {
    desc.innerText = "Select physical runs scored during the wicket event.";
    for(let i=0; i<=4; i++) optionsContainer.innerHTML += `<button class="btn score-btn" onclick="submitModalRuns(${i})">${i}</button>`;
  } else {
    desc.innerText = "Select penalty runs associated with this Extra.";
    for(let i=1; i<=7; i++) optionsContainer.innerHTML += `<button class="btn score-btn" onclick="submitModalRuns(${i})">${i}</button>`;
  }
  runsModal.classList.remove("hidden");
}

function submitModalRuns(runsSelected) {
  runsModal.classList.add("hidden");
  const inn = matchState.currentInnings;
  const data = matchState.inningsData[inn];
  const battingTeamId = getBatTeamId(inn);
  
  if (pendingActionType === 'out') {
    captureState();
    const striker = matchState.teams[battingTeamId].players.find(p => p.id === data.activeStrikerId);
    striker.isOut = true; striker.balls += 1; striker.runs += runsSelected;
    
    data.totalRuns += runsSelected; data.wickets += 1; data.totalBalls += 1;
    data.ballHistory.push({ runs: runsSelected, ballsCounted: 1, label: runsSelected > 0 ? `W+${runsSelected}` : "W" });
    
    if (data.activeBowlerId) {
      data.bowlingStats[data.activeBowlerId].runs += runsSelected;
      data.bowlingStats[data.activeBowlerId].balls += 1;
      data.bowlingStats[data.activeBowlerId].wickets += 1;
    }

    if (data.wickets >= matchState.teams[battingTeamId].players.length - 1) {
      handleInningsTransition(); return;
    } else {
      promptForNewBatter("Wicket!", "Select incoming batter.", (newBatterId) => {
        if (runsSelected % 2 !== 0) {
          data.activeStrikerId = data.activeNonStrikerId;
          data.activeNonStrikerId = newBatterId;
        } else {
          data.activeStrikerId = newBatterId;
        }
        checkOverAndInningsEnd(1); 
      });
    }
  } else if (pendingActionType === 'ex') {
    handleScoreAction(runsSelected, 0, true, `E${runsSelected}`);
  }
}

function checkOverAndInningsEnd(ballsCounted) {
  const inn = matchState.currentInnings;
  const data = matchState.inningsData[inn];
  if (matchState.isComplete) return;

  if (inn === 2 && matchState.target && data.totalRuns >= matchState.target) { endMatch(getBatTeamId(2)); return; }

  if (data.totalBalls >= matchState.maxOvers * 6) {
    handleInningsTransition();
    return;
  }

  if (ballsCounted > 0 && data.totalBalls > 0 && data.totalBalls % 6 === 0) {
    swapStrike(); 
    promptForNewBowler("End of Over", "Select bowler for the new over.", (newBowlerId) => {
      data.activeBowlerId = newBowlerId; renderScoreboard(); saveToLocalStorage();
    });
  } else {
    renderScoreboard(); saveToLocalStorage();
  }
}

function handleInningsTransition() {
  const inn = matchState.currentInnings;
  const data = matchState.inningsData[inn];
  if (inn === 1) {
    matchState.target = data.totalRuns + 1;
    matchState.currentInnings = 2;
    alert(`Innings Break! Target is ${matchState.target}`);
    kickoffInnings(2);
  } else {
    if (data.totalRuns < matchState.target - 1) endMatch(getBowlTeamId(2)); 
    else if (data.totalRuns === matchState.target - 1) endMatch(null); 
    else endMatch(getBatTeamId(2)); 
  }
}

// --- SERIES & MATCH END LOGIC ---
function endMatch(winnerTeamId) {
  matchState.isComplete = true;
  if (winnerTeamId === 1) matchState.seriesScore[1]++;
  else if (winnerTeamId === 2) matchState.seriesScore[2]++;

  // ARCHIVE MATCH DATA FOR SERIES CSV
  matchState.matchHistoryArchive.push({
    teams: JSON.parse(JSON.stringify(matchState.teams)),
    inningsBattingTeam: JSON.parse(JSON.stringify(matchState.inningsBattingTeam)),
    inningsData: JSON.parse(JSON.stringify(matchState.inningsData)),
    maxOvers: matchState.maxOvers
  });

  alert(`Match Complete! ${winnerTeamId ? matchState.teams[winnerTeamId].name + " wins!" : "It's a tie!"}`);
  renderScoreboard(); saveToLocalStorage();
}

document.getElementById("next-match-btn").addEventListener("click", () => {
  captureState();
  matchState.currentInnings = 1; matchState.target = null; matchState.isComplete = false;
  matchState.inningsData = {
    1: { totalRuns: 0, wickets: 0, totalBalls: 0, ballHistory: [], activeStrikerId: null, activeNonStrikerId: null, activeBowlerId: null, bowlingStats: {} },
    2: { totalRuns: 0, wickets: 0, totalBalls: 0, ballHistory: [], activeStrikerId: null, activeNonStrikerId: null, activeBowlerId: null, bowlingStats: {} }
  };
  [1, 2].forEach(id => matchState.teams[id].players.forEach(p => { p.runs = 0; p.balls = 0; p.fours = 0; p.sixes = 0; p.isOut = false; }));
  
  document.getElementById("bat-first-t1-btn").innerText = matchState.teams[1].name;
  document.getElementById("bat-first-t2-btn").innerText = matchState.teams[2].name;
  tossModal.classList.remove("hidden");
});

// --- DISPLAY RENDERER & RUN RATES ---
function formatOvers(balls) { return Math.floor(balls / 6) + "." + (balls % 6); }

function renderScoreboard() {
  const inn = matchState.currentInnings;
  const data = matchState.inningsData[inn];
  const battingTeam = matchState.teams[getBatTeamId(inn)];
  const bowlingTeam = matchState.teams[getBowlTeamId(inn)];

  document.getElementById("innings-title").innerText = `${battingTeam.name} Batting (${inn === 1 ? '1st' : '2nd'} Inn.)`;
  document.getElementById("display-runs").innerText = data.totalRuns;
  document.getElementById("display-wickets").innerText = data.wickets;
  document.getElementById("display-overs").innerText = formatOvers(data.totalBalls);
  document.getElementById("display-max-overs").innerText = matchState.maxOvers;
  
  let crr = "0.00";
  if (data.totalBalls > 0) {
    const actualOvers = data.totalBalls / 6;
    crr = (data.totalRuns / actualOvers).toFixed(2);
  }
  document.getElementById("display-crr").innerText = crr;

  if (inn === 2 && matchState.target !== null) {
    document.getElementById("target-container").classList.remove("hidden");
    document.getElementById("display-target").innerText = matchState.target;
    
    document.getElementById("rrr-container").classList.remove("hidden");
    const runsRequired = matchState.target - data.totalRuns;
    const ballsRemaining = (matchState.maxOvers * 6) - data.totalBalls;
    let rrr = "0.00";
    if (ballsRemaining > 0) {
      const oversRemaining = ballsRemaining / 6;
      rrr = (runsRequired / oversRemaining).toFixed(2);
    }
    document.getElementById("display-rrr").innerText = rrr;
  } else {
    document.getElementById("target-container").classList.add("hidden");
    document.getElementById("rrr-container").classList.add("hidden");
  }

  const seriesDiv = document.getElementById("series-score-display");
  if (matchState.seriesScore[1] > 0 || matchState.seriesScore[2] > 0) {
    seriesDiv.classList.remove("hidden");
    seriesDiv.innerText = `Series: ${matchState.teams[1].name} ${matchState.seriesScore[1]} - ${matchState.seriesScore[2]} ${matchState.teams[2].name}`;
  }
  
  if (matchState.isComplete) {
    document.getElementById("next-match-btn").classList.remove("hidden");
  } else {
    document.getElementById("next-match-btn").classList.add("hidden");
  }

  const updatePlayerView = (elName, elStats, pId) => {
    if (pId) {
      const p = battingTeam.players.find(x => x.id === pId);
      document.getElementById(elName).innerText = p ? p.name : "--";
      document.getElementById(elStats).innerText = p ? `${p.runs} (${p.balls})` : "0 (0)";
    } else {
      document.getElementById(elName).innerText = "--";
      document.getElementById(elStats).innerText = "0 (0)";
    }
  };
  updatePlayerView("striker-name", "striker-stats", data.activeStrikerId);
  updatePlayerView("non-striker-name", "non-striker-stats", data.activeNonStrikerId);

  if (data.activeBowlerId) {
    const bowler = bowlingTeam.players.find(p => p.id === data.activeBowlerId);
    const bStats = data.bowlingStats[data.activeBowlerId];
    document.getElementById("bowler-name").innerText = bowler ? bowler.name : "--";
    document.getElementById("bowler-stats").innerText = `${formatOvers(bStats.balls)}-0-${bStats.runs}-${bStats.wickets}`;
  }
}

// --- FULL RESET (HARD WIPE) ---
document.getElementById("reset-btn").addEventListener("click", () => {
  if (!confirm("Are you sure you want to completely reset? This will wipe the teams and Series Score too.")) return;
  
  localStorage.removeItem("creasecount_matchState_v9"); 
  localStorage.removeItem("creasecount_actionHistory_v9");
  
  matchState = {
    currentInnings: 1, target: null, maxOvers: 20, isComplete: false, seriesScore: { 1: 0, 2: 0 }, inningsBattingTeam: { 1: 1, 2: 2 }, matchHistoryArchive: [],
    teams: { 1: { name: "", players: [] }, 2: { name: "", players: [] } },
    inningsData: {
      1: { totalRuns: 0, wickets: 0, totalBalls: 0, ballHistory: [], activeStrikerId: null, activeNonStrikerId: null, activeBowlerId: null, bowlingStats: {} },
      2: { totalRuns: 0, wickets: 0, totalBalls: 0, ballHistory: [], activeStrikerId: null, activeNonStrikerId: null, activeBowlerId: null, bowlingStats: {} }
    }
  };
  actionHistory = [];

  document.getElementById("team1-name").value = "";
  document.getElementById("team2-name").value = "";
  
  document.getElementById("team1-players").innerHTML = `
    <div class="player-input-row"><input type="text" class="player-input" placeholder="Opening Batter 1" required></div>
    <div class="player-input-row mt-1"><input type="text" class="player-input" placeholder="Opening Batter 2" required></div>
  `;
  document.getElementById("team2-players").innerHTML = `
    <div class="player-input-row"><input type="text" class="player-input" placeholder="Opening Batter 1" required></div>
    <div class="player-input-row mt-1"><input type="text" class="player-input" placeholder="Opening Batter 2" required></div>
  `;
  
  document.getElementById("series-score-display").classList.add("hidden");
  document.getElementById("next-match-btn").classList.add("hidden");
  
  matchScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
});

// --- OVERS LOG & SCORECARD ---
document.getElementById("overs-view-btn").addEventListener("click", () => {
  const inn = matchState.currentInnings;
  const history = matchState.inningsData[inn].ballHistory;
  oversLogContainer.innerHTML = "";
  let rowsHTML = ""; let currentOverBalls = []; let overNumber = 1; let validBallsInCurrentOver = 0;
  
  history.forEach((event) => {
    let displayLabel = (event.label !== null && event.label !== undefined) ? event.label : event.runs;
    currentOverBalls.push(displayLabel);
    validBallsInCurrentOver += event.ballsCounted;
    if (validBallsInCurrentOver >= 6) {
      rowsHTML += `<div class="log-row"><div>Over ${overNumber}</div><div class="ball-badges">${currentOverBalls.map(l => `<span class="badge">${l}</span>`).join(" ")}</div></div>`;
      overNumber++; currentOverBalls = []; validBallsInCurrentOver = 0;
    }
  });
  if (currentOverBalls.length > 0) {
    rowsHTML += `<div class="log-row"><div>Over ${overNumber}</div><div class="ball-badges">${currentOverBalls.map(l => `<span class="badge">${l}</span>`).join(" ")}</div></div>`;
  }
  oversLogContainer.innerHTML = rowsHTML || "<div style='padding:20px; color:#94a3b8;'>No balls delivered yet.</div>";
  oversModal.classList.remove("hidden");
});

document.getElementById("scorecard-btn").addEventListener("click", () => { 
  const container = document.getElementById("scorecard-container"); container.innerHTML = "";
  for (let inn = 1; inn <= 2; inn++) {
    const data = matchState.inningsData[inn];
    if (data.totalBalls === 0 && data.totalRuns === 0 && data.wickets === 0) continue; 
    
    const batTeam = matchState.teams[getBatTeamId(inn)]; 
    const bowlTeam = matchState.teams[getBowlTeamId(inn)];
    
    let html = `<h4 style="margin-top:10px; color:var(--primary-color);">${batTeam.name} Innings (${data.totalRuns}/${data.wickets})</h4>`;
    html += `<table class="stats-table"><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th></tr>`;
    batTeam.players.forEach(p => {
      if (p.balls > 0 || p.id === data.activeStrikerId || p.id === data.activeNonStrikerId) {
        let status = p.isOut ? "(out)" : "*";
        html += `<tr><td>${p.name} <span style="color:#94a3b8;font-size:0.8rem;">${status}</span></td><td>${p.runs}</td><td>${p.balls}</td><td>${p.fours}</td><td>${p.sixes}</td></tr>`;
      }
    });
    html += `</table><table class="stats-table" style="margin-top:10px;"><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th></tr>`;
    Object.keys(data.bowlingStats).forEach(bId => {
      const b = bowlTeam.players.find(p => p.id === bId); 
      if (b) {
        const s = data.bowlingStats[bId];
        html += `<tr><td>${b.name}</td><td>${formatOvers(s.balls)}</td><td>${s.runs}</td><td>${s.wickets}</td></tr>`;
      }
    });
    container.innerHTML += html + `</table><hr class="console-divider" style="margin-top:15px;">`;
  }
  scorecardModal.classList.remove("hidden");
});

// --- UPDATED CSV EXPORT (HUMAN-READABLE SCORECARDS SEPARATED BY MATCH) ---
document.getElementById("export-csv-btn").addEventListener("click", () => {
  if (!matchState) return;
  let csvRows = [];
  
  csvRows.push(["CREASECOUNT SERIES SCORECARDS"]);
  csvRows.push([]);
  csvRows.push(["SERIES SCORE"]);
  csvRows.push([matchState.teams[1].name, matchState.seriesScore[1], "-", matchState.seriesScore[2], matchState.teams[2].name]);
  csvRows.push([]);

  // 1. Pull archived matches
  let allMatchesToExport = [...matchState.matchHistoryArchive];
  
  // 2. Safely append the live match if it is actively being played
  const inn1Data = matchState.inningsData[1];
  const liveMatchInProgress = !matchState.isComplete && (inn1Data.totalBalls > 0 || inn1Data.totalRuns > 0 || inn1Data.wickets > 0);

  if (liveMatchInProgress) {
    allMatchesToExport.push({
      teams: matchState.teams,
      inningsBattingTeam: matchState.inningsBattingTeam,
      inningsData: matchState.inningsData,
      maxOvers: matchState.maxOvers
    });
  }

  // 3. Build distinct, formatted scoreboards for every match
  allMatchesToExport.forEach((matchObj, matchIndex) => {
    let matchNum = matchIndex + 1;
    csvRows.push([`========================================`]);
    csvRows.push([`MATCH ${matchNum} SCORECARD`]);
    csvRows.push([`========================================`]);
    csvRows.push([]);

    for (let inn = 1; inn <= 2; inn++) {
      const data = matchObj.inningsData[inn];
      if (!data || (data.totalBalls === 0 && data.totalRuns === 0 && data.wickets === 0)) continue;
      
      const batTeamId = matchObj.inningsBattingTeam[inn];
      const bowlTeamId = matchObj.inningsBattingTeam[inn === 1 ? 2 : 1];
      const batTeam = matchObj.teams[batTeamId];
      const bowlTeam = matchObj.teams[bowlTeamId];

      if (!batTeam || !bowlTeam) continue;

      // Innings Header
      csvRows.push([`${batTeam.name} INNINGS`, `${data.totalRuns}/${data.wickets}`, `Overs: ${formatOvers(data.totalBalls)} / ${matchObj.maxOvers}`]);
      csvRows.push([]);
      
      // Batter Stats
      csvRows.push(["BATTER", "RUNS", "BALLS", "4s", "6s", "STATUS"]);
      batTeam.players.forEach(p => {
        if (p.balls > 0 || p.runs > 0 || p.isOut) {
          let status = p.isOut ? "Out" : "Not Out";
          csvRows.push([`"${p.name}"`, p.runs, p.balls, p.fours, p.sixes, status]);
        }
      });
      csvRows.push([]);

      // Bowler Stats
      csvRows.push(["BOWLER", "OVERS", "RUNS", "WICKETS"]);
      Object.keys(data.bowlingStats).forEach(bId => {
        const b = bowlTeam.players.find(x => x.id === bId);
        if (b) {
          const s = data.bowlingStats[bId];
          csvRows.push([`"${b.name}"`, formatOvers(s.balls), s.runs, s.wickets]);
        }
      });
      csvRows.push([]);
      csvRows.push(["--------------------------------------------------"]);
      csvRows.push([]);
    }
  });

  // 4. Output standard CSV file
  const csvContent = csvRows.map(row => row.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute("download", `CreaseCount_Scorecards_${dateStr}.csv`);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

document.getElementById("close-scorecard-btn").addEventListener("click", () => scorecardModal.classList.add("hidden"));
document.getElementById("close-overs-btn").addEventListener("click", () => oversModal.classList.add("hidden"));
document.getElementById("complete-btn").addEventListener("click", () => {
  if (matchState.isComplete) return;
  if (confirm("Are you sure you want to declare/end this innings early?")) { captureState(); handleInningsTransition(); }
});
document.getElementById("undo-btn").addEventListener("click", () => {
  if (actionHistory.length > 0) { matchState = actionHistory.pop(); renderScoreboard(); saveToLocalStorage(); }
});
document.getElementById("support-trigger").addEventListener("click", () => window.open("https://www.paypal.com/requestpayment/bhasuraliyanage1@gmail.com", "_blank"));
document.addEventListener("DOMContentLoaded", loadFromLocalStorage);
