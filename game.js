// College Football 16-0 Game Controller

// Slots configuration (6 Offense, 6 Defense)
const offenseSlots = [
    { id: "QB", label: "QB", side: "offense", eligible: ["QB"], desc: "Quarterback" },
    { id: "RB", label: "RB", side: "offense", eligible: ["RB"], desc: "Running Back" },
    { id: "WR1", label: "WR", side: "offense", eligible: ["WR"], desc: "Wide Receiver" },
    { id: "WR2", label: "WR", side: "offense", eligible: ["WR"], desc: "Wide Receiver" },
    { id: "TE", label: "TE", side: "offense", eligible: ["TE"], desc: "Tight End" },
    { id: "FLEX", label: "FLEX", side: "offense", eligible: ["RB", "WR", "TE"], desc: "RB/WR/TE" }
];

const defenseSlots = [
    { id: "EDGE", label: "EDGE", side: "defense", eligible: ["EDGE"], desc: "Edge Rusher" },
    { id: "DT", label: "DT", side: "defense", eligible: ["DT"], desc: "Defensive Tackle" },
    { id: "LB", label: "LB", side: "defense", eligible: ["LB"], desc: "Linebacker" },
    { id: "CB", label: "CB", side: "defense", eligible: ["CB"], desc: "Cornerback" },
    { id: "S", label: "S", side: "defense", eligible: ["S"], desc: "Safety" },
    { id: "DFLEX", label: "D-FLEX", side: "defense", eligible: ["EDGE", "DT", "LB", "CB", "S"], desc: "Defensive Flex" }
];

const allSlots = [...offenseSlots, ...defenseSlots];

// Position weights for simulation wins calculation
const slotWeights = {
    QB: 1.5,
    RB: 1.0,
    WR1: 1.0, WR2: 1.0,
    TE: 1.0,
    FLEX: 1.0,
    EDGE: 1.2,
    DT: 1.0,
    LB: 1.0,
    CB: 1.2,
    S: 1.0,
    DFLEX: 1.0
};

// 5-year era definitions
const eras = [
    { label: "2001-2005", start: 2001, end: 2005 },
    { label: "2006-2010", start: 2006, end: 2010 },
    { label: "2011-2015", start: 2011, end: 2015 },
    { label: "2016-2020", start: 2016, end: 2020 },
    { label: "2021-2025", start: 2021, end: 2025 }
];

class CollegeGame {
    constructor() {
        this.gameMode = "classic"; // "classic" (are you sure you can handle this load) or "hard" (choose hard)
        this.roster = {}; // slotId -> playerObject
        this.rerolls = 2;
        this.spin = null; // current spin { team, era, pool }
        this.selectedPlayer = null;
        this.usedTeams = { offense: new Set(), defense: new Set() };
        this.isSpinning = false;
        this.lastRolled = null; // track previous roll to prevent consecutive duplicate rolls
        
        // Grab database from window (loaded via database.js)
        this.dbTeams = window.CFB_DATABASE ? window.CFB_DATABASE.teams : [];
        this.dbPlayers = window.CFB_DATABASE ? window.CFB_DATABASE.players : [];
        
        this.precomputeTeamEraWeights();
        
        this.initDOMElements();
        this.bindEvents();
    }

    precomputeTeamEraWeights() {
        this.teamEraWeights = {};
        this.dbTeams.forEach(team => {
            eras.forEach(era => {
                const key = `${team.abbr}_${era.label}`;
                const players = this.dbPlayers.filter(p => p.teamAbbr === team.abbr && p.season >= era.start && p.season <= era.end);
                
                if (players.length === 0) {
                    this.teamEraWeights[key] = 0;
                    return;
                }
                
                const ratings = players.map(p => p.rating);
                const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
                const maxRating = Math.max(...ratings);
                
                // Bowl eligibility filter: average rating >= 79.5 OR max rating >= 88
                if (avgRating < 79.5 && maxRating < 88) {
                    this.teamEraWeights[key] = 0;
                } else {
                    // Weighted skew: give powerhouse teams much higher chance
                    this.teamEraWeights[key] = Math.max(1, Math.pow(avgRating - 78.5, 2.5));
                }
            });
        });
    }

    initDOMElements() {
        this.screens = {
            welcome: document.getElementById("welcome-screen"),
            game: document.getElementById("game-screen")
        };
        this.btnStartMockler = document.getElementById("start-mockler-btn");
        this.btnStartHard = document.getElementById("start-hard-btn");
        this.btnReset = document.getElementById("reset-draft-btn");
        this.btnSpin = document.getElementById("spin-btn");
        this.btnReroll = document.getElementById("reroll-btn");
        this.btnPlayAgain = document.getElementById("play-again-btn");
        this.btnCloseResults = document.getElementById("close-results-btn");
        this.btnCopyShare = document.getElementById("copy-share-btn");
        
        this.grids = {
            offense: document.getElementById("offense-slots"),
            defense: document.getElementById("defense-slots")
        };
        
        this.counters = {
            offense: document.getElementById("offense-count"),
            defense: document.getElementById("defense-count"),
            offenseRerolls: document.getElementById("offense-rerolls"),
            defenseRerolls: document.getElementById("defense-rerolls")
        };

        this.liveStats = {
            off: document.getElementById("live-off-rtg"),
            def: document.getElementById("live-def-rtg"),
            wins: document.getElementById("live-wins")
        };

        this.drawerStates = {
            spinCta: document.getElementById("spin-cta-state"),
            poolDraft: document.getElementById("pool-draft-state")
        };

        this.poolTeamTitle = document.getElementById("pool-team-title");
        this.poolEraBadge = document.getElementById("pool-era-badge");
        this.playerPoolContainer = document.getElementById("player-pool-container");
        this.rerollCountBadge = document.getElementById("reroll-count-badge");
        this.resultsModal = document.getElementById("results-modal");
        this.homeLink = document.getElementById("home-link");
        this.workspaceGrid = document.querySelector(".workspace-grid");
        this.tabOffense = document.getElementById("tab-offense");
        this.tabDefense = document.getElementById("tab-defense");
    }

    bindEvents() {
        if (this.btnStartMockler) {
            this.btnStartMockler.addEventListener("click", () => this.startNewGame("classic"));
        }
        if (this.btnStartHard) {
            this.btnStartHard.addEventListener("click", () => this.startNewGame("hard"));
        }
        this.btnReset.addEventListener("click", () => this.resetDraft());
        this.btnSpin.addEventListener("click", () => this.rollSlotMachine());
        this.btnReroll.addEventListener("click", () => this.triggerReroll());
        this.btnPlayAgain.addEventListener("click", () => {
            this.resultsModal.classList.remove("active");
            this.showScreen("welcome");
        });
        this.btnCloseResults.addEventListener("click", () => this.closeResults());
        this.btnCopyShare.addEventListener("click", () => this.copyShareCode());
        this.homeLink.addEventListener("click", () => this.showScreen("welcome"));
        this.tabOffense.addEventListener("click", () => this.switchMobileTab("offense"));
        this.tabDefense.addEventListener("click", () => this.switchMobileTab("defense"));
    }

    showScreen(screenId) {
        Object.keys(this.screens).forEach(key => {
            this.screens[key].classList.toggle("active", key === screenId);
        });
    }

    switchMobileTab(side) {
        if (!this.workspaceGrid) return;
        if (side === "offense") {
            this.workspaceGrid.className = "workspace-grid show-offense";
            this.tabOffense.classList.add("active");
            this.tabDefense.classList.remove("active");
        } else {
            this.workspaceGrid.className = "workspace-grid show-defense";
            this.tabOffense.classList.remove("active");
            this.tabDefense.classList.add("active");
        }
    }

    startNewGame(mode = "classic") {
        this.gameMode = mode;
        this.roster = {};
        this.rerolls = 2;
        this.spin = null;
        this.usedTeams.offense.clear();
        this.usedTeams.defense.clear();
        this.isSpinning = false;
        this.lastRolled = null;
        
        // Update header game mode badge
        const badge = document.getElementById("header-game-mode-badge");
        if (badge) {
            if (mode === "hard") {
                badge.innerText = "Choose Hard";
                badge.className = "header-badge hard-mode-accent";
            } else {
                badge.innerText = "Load Mode";
                badge.className = "header-badge classic-mode-accent";
            }
        }
        
        this.resultsModal.classList.remove("active");
        this.showScreen("game");
        
        this.renderRosterGrids();
        this.updateLiveProjectedStats();
        this.showDrawerState("spinCta");
        this.switchMobileTab("offense");
    }

    resetDraft() {
        if (confirm("Are you sure you want to reset your draft? You will lose all drafted players.")) {
            this.startNewGame(this.gameMode);
        }
    }

    closeResults() {
        this.resultsModal.classList.remove("active");
    }

    get activeSide() {
        // Offense first: fill all 12 offensive slots, then move to defense
        const offFilled = offenseSlots.filter(s => this.roster[s.id]).length;
        return offFilled < 6 ? "offense" : "defense";
    }

    get currentEligibleSlots() {
        if (this.gameMode === "hard") {
            return this.activeSide === "offense" ? offenseSlots : defenseSlots;
        }
        return allSlots;
    }

    get filledCount() {
        return allSlots.filter(s => this.roster[s.id]).length;
    }

    get isRosterComplete() {
        return this.filledCount === 12;
    }

    showDrawerState(stateName) {
        Object.keys(this.drawerStates).forEach(key => {
            this.drawerStates[key].classList.toggle("active", key === stateName);
        });
        if (this.screens && this.screens.game) {
            this.screens.game.classList.toggle("layout-drafting", stateName === "poolDraft");
            this.screens.game.classList.toggle("layout-spinning", stateName === "spinCta");
        }
    }

    renderRosterGrids() {
        // Render Offense slots
        this.grids.offense.innerHTML = "";
        offenseSlots.forEach(slot => {
            this.grids.offense.appendChild(this.createSlotRow(slot));
        });

        // Render Defense slots
        this.grids.defense.innerHTML = "";
        defenseSlots.forEach(slot => {
            this.grids.defense.appendChild(this.createSlotRow(slot));
        });

        // Render Bottom Sheet slots (Mobile)
        this.renderBottomSheetSlots();

        // Render counts and rerolls
        const offCount = offenseSlots.filter(s => this.roster[s.id]).length;
        const defCount = defenseSlots.filter(s => this.roster[s.id]).length;
        
        this.counters.offense.innerText = `${offCount}/6`;
        this.counters.defense.innerText = `${defCount}/6`;
        
        this.counters.offenseRerolls.innerText = `Rerolls: ${this.rerolls}`;
        this.counters.defenseRerolls.innerText = `Rerolls: ${this.rerolls}`;
        this.rerollCountBadge.innerText = this.rerolls;
        this.switchMobileTab(this.activeSide);
    }

    renderBottomSheetSlots() {
        const offContainer = document.getElementById("sheet-off-slots");
        const defContainer = document.getElementById("sheet-def-slots");
        if (!offContainer || !defContainer) return;
        
        offContainer.innerHTML = "";
        defContainer.innerHTML = "";
        
        // Render Offense slots in bottom sheet
        offenseSlots.forEach(slot => {
            offContainer.appendChild(this.createBottomSheetSlotCell(slot));
        });
        
        // Render Defense slots in bottom sheet
        defenseSlots.forEach(slot => {
            defContainer.appendChild(this.createBottomSheetSlotCell(slot));
        });
        
        // Update progress text
        const progressVal = document.getElementById("sheet-progress-val");
        if (progressVal) {
            progressVal.innerText = `${this.filledCount} / 12`;
        }
    }

    createBottomSheetSlotCell(slot) {
        const cell = document.createElement("div");
        cell.className = "sheet-slot-cell";
        cell.id = `sheet-cell-${slot.id}`;
        
        const player = this.roster[slot.id];
        if (player) {
            cell.classList.add("filled");
            cell.style.backgroundColor = this.getTeamColor(player.teamAbbr);
            cell.style.borderColor = this.getTeamColor(player.teamAbbr);
            
            // Show team abbreviation (high contrast)
            const teamBadge = document.createElement("span");
            teamBadge.className = "cell-team-abbr";
            teamBadge.innerText = player.teamAbbr;
            
            // Show player last name or initials in small text
            const nameLabel = document.createElement("span");
            nameLabel.className = "cell-player-name";
            const nameParts = player.name.split(" ");
            const lastName = nameParts[nameParts.length - 1];
            nameLabel.innerText = lastName.substring(0, 7); // keep it short
            
            cell.appendChild(teamBadge);
            cell.appendChild(nameLabel);
        } else {
            cell.classList.add("empty");
            const label = document.createElement("span");
            label.className = "cell-slot-label";
            label.innerText = slot.label === "D-FLEX" ? "D-FLX" : slot.label;
            cell.appendChild(label);
        }
        
        // Handle slot cell click (for placement)
        cell.addEventListener("click", () => this.handleSlotClick(slot));
        
        return cell;
    }

    createSlotRow(slot) {
        const row = document.createElement("div");
        row.className = "slot-row";
        row.id = `slot-row-${slot.id}`;
        
        const labelBox = document.createElement("div");
        labelBox.className = "slot-label-box";
        
        const label = document.createElement("span");
        label.className = "slot-label";
        label.innerText = slot.label;
        
        const desc = document.createElement("span");
        desc.className = "slot-desc";
        desc.innerText = slot.desc;
        
        labelBox.appendChild(label);
        labelBox.appendChild(desc);
        row.appendChild(labelBox);
        
        const player = this.roster[slot.id];
        if (player) {
            row.style.borderLeft = `4px solid ${this.getTeamColor(player.teamAbbr)}`;
            
            const playerFilled = document.createElement("div");
            playerFilled.className = "slot-player-filled animate-scale";
            
            const mainInfo = document.createElement("div");
            mainInfo.className = "filled-player-main";
            
            const name = document.createElement("span");
            name.className = "filled-player-name";
            name.innerText = player.name;
            
            const meta = document.createElement("span");
            meta.className = "filled-player-meta";
            meta.innerText = `${player.position} • Class of ${player.season}`;
            
            mainInfo.appendChild(name);
            mainInfo.appendChild(meta);
            
            const teamBadge = document.createElement("span");
            teamBadge.className = "filled-team-badge";
            teamBadge.innerText = player.teamAbbr;
            teamBadge.style.backgroundColor = this.getTeamColor(player.teamAbbr);
            
            playerFilled.appendChild(mainInfo);
            playerFilled.appendChild(teamBadge);
            row.appendChild(playerFilled);
        } else {
            const emptyText = document.createElement("span");
            emptyText.className = "slot-empty-text";
            emptyText.innerText = "Empty Slot";
            row.appendChild(emptyText);
        }
        
        // Add click listener for placement
        row.addEventListener("click", () => this.handleSlotClick(slot));
        
        return row;
    }

    getTeamColor(teamAbbr) {
        const teamObj = this.dbTeams.find(t => t.abbr === teamAbbr);
        return teamObj ? teamObj.color : "#475569";
    }

    getTeamName(teamAbbr) {
        const teamObj = this.dbTeams.find(t => t.abbr === teamAbbr);
        return teamObj ? teamObj.name : teamAbbr;
    }

    isTeamEraValidForDraft(teamAbbr, startYear, endYear) {
        // 1. Total players in the database for this team and era must be >= 8
        const totalPlayers = this.dbPlayers.filter(p => p.teamAbbr === teamAbbr && p.season >= startYear && p.season <= endYear);
        if (totalPlayers.length < 8) return false;
        
        // 2. Identify open slots and needed positions
        const openSlots = this.currentEligibleSlots.filter(slot => !this.roster[slot.id]);
        if (openSlots.length === 0) return false;
        
        const neededPositions = new Set();
        openSlots.forEach(slot => {
            slot.eligible.forEach(pos => {
                neededPositions.add(pos);
            });
        });
        
        // 3. Filter available players not already rostered
        const availablePlayers = totalPlayers.filter(p => {
            return !Object.values(this.roster).some(rp => rp.id === p.id);
        });
        
        // Check if there is at least one eligible player
        const hasAnyEligible = availablePlayers.some(p => neededPositions.has(p.position));
        if (!hasAnyEligible) return false;
        
        // 4. Ensure there is at least one needed position with >= 2 available players
        let hasPositionWithAtLeastTwo = false;
        for (const pos of neededPositions) {
            const count = availablePlayers.filter(p => p.position === pos).length;
            if (count >= 2) {
                hasPositionWithAtLeastTwo = true;
                break;
            }
        }
        
        return hasPositionWithAtLeastTwo;
    }

    async rollSlotMachine() {
        if (this.isSpinning) return;
        this.isSpinning = true;
        this.selectedPlayer = null;
        
        // Show slot machine reels during spin/reroll animations
        this.showDrawerState("spinCta");
        
        const teamWheel = document.getElementById("slot-team-wheel");
        const eraWheel = document.getElementById("slot-era-wheel");
        
        teamWheel.classList.add("spinning");
        eraWheel.classList.add("spinning");
        teamWheel.innerHTML = `<span class="wheel-text">SPINNING...</span>`;
        eraWheel.innerHTML = `<span class="wheel-text">SPINNING...</span>`;
        
        // Wait for visual rotation animation
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Pick a team and an era
        let rolledTeam = null;
        let rolledEra = null;
        let pool = [];
        
        // Build a list of available (team, era) pairs
        let candidates = [];
        let totalWeight = 0;
        
        this.dbTeams.forEach(team => {
            const offEligible = !this.usedTeams.offense.has(team.abbr);
            const defEligible = !this.usedTeams.defense.has(team.abbr);
            
            if (offEligible || defEligible) {
                eras.forEach(era => {
                    const key = `${team.abbr}_${era.label}`;
                    const weight = this.teamEraWeights[key] || 0;
                    if (weight > 0 && this.isTeamEraValidForDraft(team.abbr, era.start, era.end)) {
                        candidates.push({ team: team.abbr, era: era, weight: weight });
                        totalWeight += weight;
                    }
                });
            }
        });
        
        // Filter out the last rolled team and era if we have multiple candidate options
        if (this.lastRolled && candidates.length > 1) {
            const filtered = candidates.filter(c => !(c.team === this.lastRolled.team && c.era.label === this.lastRolled.era));
            if (filtered.length > 0) {
                candidates = filtered;
                totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
            }
        }
        
        if (candidates.length === 0) {
            // Fallback 1: Allow any team/era that has at least 8 players and at least 1 eligible player matching needs
            this.dbTeams.forEach(team => {
                const offEligible = !this.usedTeams.offense.has(team.abbr);
                const defEligible = !this.usedTeams.defense.has(team.abbr);
                
                if (offEligible || defEligible) {
                    eras.forEach(era => {
                        const key = `${team.abbr}_${era.label}`;
                        const weight = this.teamEraWeights[key] || 0;
                        if (weight > 0) {
                            const totalPlayers = this.dbPlayers.filter(p => p.teamAbbr === team.abbr && p.season >= era.start && p.season <= era.end);
                            if (totalPlayers.length >= 8) {
                                const openSlots = this.currentEligibleSlots.filter(slot => !this.roster[slot.id]);
                                const neededPositions = new Set();
                                openSlots.forEach(s => s.eligible.forEach(pos => neededPositions.add(pos)));
                                const availablePlayers = totalPlayers.filter(p => !Object.values(this.roster).some(rp => rp.id === p.id));
                                const hasAnyEligible = availablePlayers.some(p => neededPositions.has(p.position));
                                
                                if (hasAnyEligible) {
                                    candidates.push({ team: team.abbr, era: era, weight: weight });
                                    totalWeight += weight;
                                }
                            }
                        }
                    });
                }
            });

            // Filter out the last rolled team and era for Fallback 1
            if (this.lastRolled && candidates.length > 1) {
                const filtered = candidates.filter(c => !(c.team === this.lastRolled.team && c.era.label === this.lastRolled.era));
                if (filtered.length > 0) {
                    candidates = filtered;
                    totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
                }
            }
        }
        
        if (candidates.length === 0) {
            // Ultimate fallback (just in case)
            this.dbTeams.forEach(team => {
                eras.forEach(era => {
                    const key = `${team.abbr}_${era.label}`;
                    const weight = this.teamEraWeights[key] || 1;
                    candidates.push({ team: team.abbr, era: era, weight: weight });
                    totalWeight += weight;
                });
            });

            // Filter out the last rolled team and era for Ultimate Fallback
            if (this.lastRolled && candidates.length > 1) {
                const filtered = candidates.filter(c => !(c.team === this.lastRolled.team && c.era.label === this.lastRolled.era));
                if (filtered.length > 0) {
                    candidates = filtered;
                    totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
                }
            }
        }
        
        // Keep rolling until we find a pool of players covering either side
        // to prevent getting stuck
        let attempts = 0;
        while (pool.length === 0 && attempts < 50 && candidates.length > 0) {
            attempts++;
            
            // Weighted random selection
            let r = Math.random() * totalWeight;
            let selected = candidates[candidates.length - 1];
            for (let i = 0; i < candidates.length; i++) {
                r -= candidates[i].weight;
                if (r <= 0) {
                    selected = candidates[i];
                    break;
                }
            }
            
            rolledTeam = selected.team;
            rolledEra = selected.era;
            pool = this.getPlayersForTeamEra(rolledTeam, rolledEra.start, rolledEra.end);
        }
        
        // Mark team as used on sides where players are actually generated in the pool
        const hasOff = pool.some(p => this.getPlayerSide(p.position) === "offense");
        const hasDef = pool.some(p => this.getPlayerSide(p.position) === "defense");
        if (hasOff) this.usedTeams.offense.add(rolledTeam);
        if (hasDef) this.usedTeams.defense.add(rolledTeam);
        
        this.spin = { team: rolledTeam, era: rolledEra, pool: pool };
        this.lastRolled = { team: rolledTeam, era: rolledEra.label };
        
        teamWheel.classList.remove("spinning");
        eraWheel.classList.remove("spinning");
        
        teamWheel.innerHTML = `<span class="wheel-text" style="color: ${this.getTeamColor(rolledTeam)}">${rolledTeam}</span>`;
        eraWheel.innerHTML = `<span class="wheel-text">${rolledEra.label}</span>`;
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        this.isSpinning = false;
        this.enterDraftingState();
    }

    getPlayersForTeamEra(teamAbbr, startYear, endYear) {
        // Position order mapping for sorting
        const positionOrder = {
            QB: 1, RB: 2, WR: 3, TE: 4,
            EDGE: 1, DT: 2, LB: 3, CB: 4, S: 5
        };
        
        // Helper to check if there is ANY eligible slot left for a position (including Flex/D-Flex)
        const hasAvailableSlot = (pos) => {
            const side = this.getPlayerSide(pos);
            // In hard mode, player side must match the current activeSide
            if (this.gameMode === "hard" && side !== this.activeSide) {
                return false;
            }
            const slots = side === "offense" ? offenseSlots : defenseSlots;
            const eligibleSlots = slots.filter(slot => slot.eligible.includes(pos));
            return eligibleSlots.some(slot => !this.roster[slot.id]);
        };

        const currentPool = this.dbPlayers.filter(p => {
            const isCorrectTeam = p.teamAbbr === teamAbbr;
            const isInEra = p.season >= startYear && p.season <= endYear;
            
            // Check if player is already rostered
            const isRostered = Object.values(this.roster).some(rosteredPlayer => rosteredPlayer.id === p.id);
            if (isRostered) return false;
            
            // Don't show position if no slot is available (dedicated or flex)
            if (!hasAvailableSlot(p.position)) return false;
            
            return isCorrectTeam && isInEra;
        });
        
        // Sort: 
        // 1. Grouped by position order (QB -> RB -> WR -> TE, etc.)
        // 2. Alphabetical by name
        return currentPool.sort((a, b) => {
            const orderA = positionOrder[a.position] || 99;
            const orderB = positionOrder[b.position] || 99;
            if (orderA !== orderB) return orderA - orderB;
            
            return a.name.localeCompare(b.name);
        });
    }

    getPlayerSide(pos) {
        if (["QB", "RB", "WR", "TE"].includes(pos)) return "offense";
        return "defense";
    }

    enterDraftingState() {
        this.showDrawerState("poolDraft");
        
        this.poolTeamTitle.innerText = this.getTeamName(this.spin.team);
        this.poolTeamTitle.style.color = this.getTeamColor(this.spin.team);
        this.poolEraBadge.innerText = this.spin.era.label;
        this.btnReroll.disabled = this.rerolls <= 0;
        this.rerollCountBadge.innerText = this.rerolls;
        
        this.renderPlayerPool();
    }

    renderPlayerPool() {
        const offPoolContainer = document.getElementById("offense-pool-container");
        const defPoolContainer = document.getElementById("defense-pool-container");
        
        offPoolContainer.innerHTML = "";
        defPoolContainer.innerHTML = "";
        
        // Filter players for offense and defense columns
        const offPlayers = this.spin.pool.filter(p => this.getPlayerSide(p.position) === "offense");
        const defPlayers = this.spin.pool.filter(p => this.getPlayerSide(p.position) === "defense");
        
        const createCard = (player) => {
            const card = document.createElement("div");
            card.className = `player-card ${this.getPlayerSide(player.position) === 'offense' ? 'offense-card' : 'defense-card'}`;
            
            const top = document.createElement("div");
            top.className = "card-top";
            
            const pos = document.createElement("span");
            pos.className = "player-pos-badge";
            pos.innerText = player.position;
            
            top.appendChild(pos);
            card.appendChild(top);
            
            const name = document.createElement("div");
            name.className = "player-card-name";
            name.innerText = player.name;
            card.appendChild(name);
            
            card.addEventListener("click", () => this.handlePlayerCardClick(player, card));
            return card;
        };
        
        if (offPlayers.length === 0) {
            offPoolContainer.innerHTML = `<div class="empty-pool-msg">No offense players available</div>`;
        } else {
            offPlayers.forEach(p => offPoolContainer.appendChild(createCard(p)));
        }
        
        if (defPlayers.length === 0) {
            defPoolContainer.innerHTML = `<div class="empty-pool-msg">No defense players available</div>`;
        } else {
            defPlayers.forEach(p => defPoolContainer.appendChild(createCard(p)));
        }
    }

    handlePlayerCardClick(player, cardElement) {
        // Toggle selection
        if (this.selectedPlayer && this.selectedPlayer.id === player.id) {
            this.selectedPlayer = null;
            cardElement.classList.remove("selected");
            this.clearHighlights();
        } else {
            this.selectedPlayer = player;
            // Remove selected class from other cards
            document.querySelectorAll(".player-card").forEach(c => c.classList.remove("selected"));
            cardElement.classList.add("selected");
            
            // Switch mobile tab to match player side so slots are visible
            const playerSide = this.getPlayerSide(player.position);
            this.switchMobileTab(playerSide);
            
            this.highlightEligibleSlots(player);
        }
    }

    highlightEligibleSlots(player) {
        this.clearHighlights();
        
        this.currentEligibleSlots.forEach(slot => {
            // Check if slot is empty AND player matches eligible positions
            if (!this.roster[slot.id] && slot.eligible.includes(player.position)) {
                // Highlight main board row
                const row = document.getElementById(`slot-row-${slot.id}`);
                if (row) row.classList.add("eligible-highlight");
                
                // Highlight bottom sheet cell
                const cell = document.getElementById(`sheet-cell-${slot.id}`);
                if (cell) cell.classList.add("eligible-highlight");
            }
        });
    }

    clearHighlights() {
        document.querySelectorAll(".slot-row").forEach(row => {
            row.classList.remove("eligible-highlight");
        });
        document.querySelectorAll(".sheet-slot-cell").forEach(cell => {
            cell.classList.remove("eligible-highlight");
        });
    }

    handleSlotClick(slot) {
        if (!this.selectedPlayer) return;
        const row = document.getElementById(`slot-row-${slot.id}`);
        const cell = document.getElementById(`sheet-cell-${slot.id}`);
        const isRowEligible = row && row.classList.contains("eligible-highlight");
        const isCellEligible = cell && cell.classList.contains("eligible-highlight");
        if (!isRowEligible && !isCellEligible) return;
        
        // Keep track of offense filled count before placement
        const offFilledBefore = offenseSlots.filter(s => this.roster[s.id]).length;

        // Place player in slot
        const player = this.selectedPlayer;
        this.roster[slot.id] = player;
        this.selectedPlayer = null;
        this.clearHighlights();
        
        // Check if we just filled the 6th offense slot in hard mode
        const offFilledAfter = offenseSlots.filter(s => this.roster[s.id]).length;
        if (this.gameMode === "hard" && offFilledBefore === 5 && offFilledAfter === 6) {
            // Transition from Offense phase to Defense phase!
            this.rerolls = 2; // Rerolls reset to 2, do not carry over
            this.showTransitionToast();
        }
        
        this.renderRosterGrids();
        this.updateLiveProjectedStats();
        
        // Show confirmation toast revealing player credentials after choice is locked
        this.showDraftConfirmationToast(player);
        
        if (this.isRosterComplete) {
            this.triggerSimulation();
        } else {
            // Back to spin CTA state
            this.spin = null;
            document.getElementById("slot-team-wheel").innerHTML = `<span class="wheel-text">SPIN FOR A TEAM</span>`;
            document.getElementById("slot-era-wheel").innerHTML = `<span class="wheel-text">SPIN FOR AN ERA</span>`;
            this.showDrawerState("spinCta");
        }
    }

    triggerReroll() {
        if (this.rerolls <= 0) return;
        
        this.rerolls--;
        this.rollSlotMachine();
    }

    calculateWeightedRating(slotArray) {
        let sumRating = 0;
        let sumWeights = 0;
        
        slotArray.forEach(slot => {
            const player = this.roster[slot.id];
            if (player) {
                const w = slotWeights[slot.id];
                sumRating += player.rating * w;
                sumWeights += w;
            }
        });
        
        return sumWeights === 0 ? 0 : sumRating / sumWeights;
    }

    updateLiveProjectedStats() {
        const offRating = this.calculateWeightedRating(offenseSlots);
        const defRating = this.calculateWeightedRating(defenseSlots);
        const teamRating = this.calculateWeightedRating(allSlots);
        
        const offScale = this.scaleRating(offRating);
        const defScale = this.scaleRating(defRating);
        
        // Check completions
        const offFilledCount = offenseSlots.filter(s => this.roster[s.id]).length;
        const defFilledCount = defenseSlots.filter(s => this.roster[s.id]).length;
        const isOffComplete = offFilledCount === 6;
        const isDefComplete = defFilledCount === 6;
        
        // Update live stats text (show Offense after Offense complete, Defense after Defense complete)
        this.liveStats.off.innerText = isOffComplete ? `${offScale}` : "--";
        this.liveStats.def.innerText = isDefComplete ? `${defScale}` : "--";
        
        // Count Consensus All-Americans / Heisman Finalists
        let aaCount = 0;
        allSlots.forEach(slot => {
            const player = this.roster[slot.id];
            if (player && player.rating >= 90) {
                aaCount++;
            }
        });
        
        // Win calculations (only show Projected Record after the entire draft is complete)
        if (this.isRosterComplete) {
            let s;
            if (teamRating <= 70) {
                s = 10 * Math.max(0, (teamRating - 55) / 15);
            } else {
                s = 10 + 6 * Math.min(1, Math.max(0, (teamRating - 70) / 22)) ** 2.2;
            }
            
            // Penalty for having less than 5 Consensus All-Americans / Heismans
            let aaPenalty = 0;
            if (aaCount < 5) {
                aaPenalty = (5 - aaCount) * 1.0;
            }
            
            const wins = Math.max(0, Math.min(16, Math.round(s - aaPenalty)));
            const losses = 16 - wins;
            this.liveStats.wins.innerText = `${wins} - ${losses}`;
        } else {
            this.liveStats.wins.innerText = "--";
        }
    }

    scaleRating(rating) {
        if (rating === 0) return 0;
        return Math.max(0, Math.round(rating / 91 * 100));
    }

    triggerSimulation() {
        const offRating = this.calculateWeightedRating(offenseSlots);
        const defRating = this.calculateWeightedRating(defenseSlots);
        const teamRating = this.calculateWeightedRating(allSlots);
        
        const offScale = this.scaleRating(offRating);
        const defScale = this.scaleRating(defRating);
        const teamScale = this.scaleRating(teamRating);
        
        // Count Consensus All-Americans / Heisman Finalists
        let aaCount = 0;
        allSlots.forEach(slot => {
            const player = this.roster[slot.id];
            if (player && player.rating >= 90) {
                aaCount++;
            }
        });
        
        // Calculate wins using new challenging math
        let s;
        if (teamRating <= 70) {
            s = 10 * Math.max(0, (teamRating - 55) / 15);
        } else {
            s = 10 + 6 * Math.min(1, Math.max(0, (teamRating - 70) / 22)) ** 2.2;
        }
        
        // Penalty for having less than 5 Consensus All-Americans / Heismans
        let aaPenalty = 0;
        if (aaCount < 5) {
            aaPenalty = (5 - aaCount) * 1.0;
        }
        
        const wins = Math.max(0, Math.min(16, Math.round(s - aaPenalty)));
        const losses = 16 - wins;
        const gradeObj = this.getSimulationGrade(wins);
        
        // Find weakest draft link
        let minRating = 999;
        let weakestSlotId = null;
        allSlots.forEach(slot => {
            const p = this.roster[slot.id];
            if (p && p.rating < minRating) {
                minRating = p.rating;
                weakestSlotId = slot.id;
            }
        });
        
        const weakestPlayer = this.roster[weakestSlotId];
        
        // Populate results fields
        document.getElementById("result-descriptor").innerText = gradeObj.descriptor;
        document.getElementById("result-record-val").innerText = `${wins} - ${losses}`;
        
        const gradeVal = document.getElementById("result-grade-val");
        gradeVal.innerText = gradeObj.grade;
        // set border and text colors for grade
        if (wins === 16) {
            gradeVal.style.borderColor = "var(--primary)";
            gradeVal.style.color = "var(--primary)";
        } else if (wins >= 13) {
            gradeVal.style.borderColor = "#10b981";
            gradeVal.style.color = "#10b981";
        } else if (wins >= 10) {
            gradeVal.style.borderColor = "#0ea5e9";
            gradeVal.style.color = "#0ea5e9";
        } else {
            gradeVal.style.borderColor = "#e11d48";
            gradeVal.style.color = "#e11d48";
        }
        
        // Display All-American count in results modal
        const aaCountVal = document.getElementById("result-aa-count-val");
        aaCountVal.innerText = `${aaCount} / 5`;
        if (aaCount >= 5) {
            aaCountVal.style.color = "#10b981";
        } else if (aaCount >= 3) {
            aaCountVal.style.color = "var(--gold)";
        } else {
            aaCountVal.style.color = "#e11d48";
        }
        
        document.getElementById("result-off-rtg").innerText = offScale;
        document.getElementById("result-def-rtg").innerText = defScale;
        document.getElementById("result-team-rtg").innerText = teamScale;
        
        if (weakestPlayer) {
            document.getElementById("weakest-player-name").innerText = `${weakestPlayer.name} (${weakestSlotId})`;
            document.getElementById("weakest-player-meta").innerHTML = `${weakestPlayer.teamAbbr} • ${weakestPlayer.season}`;
            document.getElementById("weakest-player-rating-val").innerText = `Rating: ${weakestPlayer.rating}`;
        }
        
        // Set share code input text
        const shareCodeText = document.getElementById("share-code-text");
        const playUrl = (window.location.hostname.endsWith('github.io') || window.location.hostname.endsWith('surge.sh')) ? window.location.href : 'https://hank-a-bot.github.io/college-football-draft-simulator/';
        shareCodeText.value = `My College Football 16-0 run: ${wins}-${losses} (${gradeObj.grade} ${gradeObj.descriptor})! Offense: ${offScale}, Defense: ${defScale}, Team Overall: ${teamScale}. Can you go perfect? play here: ${playUrl}`;
        
        // Reset copy message
        document.getElementById("copy-status-msg").style.display = "none";
        
        // Render final roster inside the results modal
        const offList = document.getElementById("results-offense-list");
        const defList = document.getElementById("results-defense-list");
        if (offList && defList) {
            offList.innerHTML = "";
            defList.innerHTML = "";
            
            offenseSlots.forEach(slot => {
                const p = this.roster[slot.id];
                if (p) {
                    offList.appendChild(this.createResultsPlayerCard(slot, p));
                }
            });
            
            defenseSlots.forEach(slot => {
                const p = this.roster[slot.id];
                if (p) {
                    defList.appendChild(this.createResultsPlayerCard(slot, p));
                }
            });
        }
        
        // Open results modal
        this.resultsModal.classList.add("active");
    }

    createResultsPlayerCard(slot, player) {
        const card = document.createElement("div");
        card.className = "results-player-item";
        
        const isStar = player.rating >= 90;
        
        card.style.borderLeft = `3px solid ${this.getTeamColor(player.teamAbbr)}`;
        
        card.innerHTML = `
            <div class="results-player-left">
                <span class="results-player-pos">${slot.label}</span>
                <div class="results-player-details">
                    <span class="results-player-name">${player.name}</span>
                    <span class="results-player-meta">${player.teamAbbr} • '${player.season.toString().substring(2)}</span>
                </div>
            </div>
            <div class="results-player-right">
                ${isStar ? `
                    <span class="results-star-badge" title="${player.accolades}">
                        <svg class="results-star-svg" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </span>
                ` : ''}
                <span class="results-player-rating">${player.rating}</span>
            </div>
        `;
        return card;
    }

    getSimulationGrade(wins) {
        const grades = [
            { threshold: 16, grade: "S+", descriptor: "Immortal" },
            { threshold: 15, grade: "A+", descriptor: "Elite" },
            { threshold: 14, grade: "A", descriptor: "Contender" },
            { threshold: 13, grade: "A-", descriptor: "Dangerous" },
            { threshold: 12, grade: "B+", descriptor: "Playoff-Bound" },
            { threshold: 11, grade: "B", descriptor: "Solid" },
            { threshold: 10, grade: "B-", descriptor: "Winning" },
            { threshold: 9, grade: "C+", descriptor: "Above Average" },
            { threshold: 8, grade: "C", descriptor: "Average" },
            { threshold: 7, grade: "C-", descriptor: "Mediocre" },
            { threshold: 5, grade: "D", descriptor: "Rebuilding" },
            { threshold: 0, grade: "F", descriptor: "Tanking" }
        ];
        
        for (const g of grades) {
            if (wins >= g.threshold) return g;
        }
        return { grade: "F", descriptor: "Tanking" };
    }

    copyShareCode() {
        const copyText = document.getElementById("share-code-text");
        copyText.select();
        copyText.setSelectionRange(0, 99999); // for mobile devices
        
        try {
            navigator.clipboard.writeText(copyText.value);
            const msg = document.getElementById("copy-status-msg");
            msg.innerText = "Copied to clipboard!";
            msg.style.display = "block";
        } catch (err) {
            alert("Failed to copy code. Please manually select and copy the text.");
        }
    }

    showDraftConfirmationToast(player) {
        // Create toast container if it doesn't exist
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }
        
        const toast = document.createElement("div");
        toast.className = "toast-notification glass-panel animate-slide-in";
        
        // Check if player has high accolades like Heisman or All-American
        const accoladesLower = (player.accolades || "").toLowerCase();
        const isAA = accoladesLower.includes("all-american") || accoladesLower.includes("all american");
        const isHeisman = accoladesLower.includes("heisman");
        
        let titleText = "Draft Confirmed";
        let iconHtml = `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: middle;"><path d="M21.71 2.29a1 1 0 0 0-1-.29C15.83 3.09 9.83 6.09 5.29 10.63a12.83 12.83 0 0 0-3 5.08 1 1 0 0 0 .29 1l4.9 4.9a1 1 0 0 0 1 .29c1.92-.5 3.65-1.5 5.08-3l5.34-5.34c3.4-3.4 5.3-7.8 2.83-10.27zM11.66 18c-1.12 1.12-2.48 1.9-3.93 2.28L4.35 16.9a8.66 8.66 0 0 1 2.28-3.93l1.1-1.1L12.7 16.9zM19.65 7.1c-1.12 1.12-2.48 1.9-3.93 2.28L12.34 6a8.66 8.66 0 0 1 2.28-3.93l1.1-1.1L20.75 6z"/></svg>`;
        
        if (isHeisman) {
            titleText = "Heisman Trophy Pick!";
            iconHtml = `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/></svg>`;
            toast.classList.add("gold-toast");
        } else if (isAA) {
            titleText = "Consensus All-American Pick!";
            iconHtml = `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
            toast.classList.add("gold-toast");
        }
        
        toast.innerHTML = `
            <div class="toast-header">
                <span class="toast-icon" style="display: inline-flex; align-items: center; color: var(--gold);">${iconHtml}</span>
                <span class="toast-title" style="margin-left: 6px;">${titleText}</span>
            </div>
            <div class="toast-body">
                <strong>${player.name}</strong> (${player.position}) • ${player.teamAbbr} • Class of ${player.season}
                ${player.accolades ? `<div class="toast-accolades">${player.accolades}</div>` : ''}
            </div>
        `;
        
        container.appendChild(toast);
        
        // Remove toast after 4 seconds
        setTimeout(() => {
            toast.classList.add("animate-slide-out");
            const onAnimationEnd = () => {
                toast.remove();
                if (container.children.length === 0) {
                    container.remove();
                }
            };
            toast.addEventListener("animationend", onAnimationEnd, { once: true });
        }, 3500);
    }

    showTransitionToast() {
        // Create toast container if it doesn't exist
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }
        
        const toast = document.createElement("div");
        toast.className = "toast-notification glass-panel animate-slide-in warning-toast";
        toast.style.borderColor = "var(--defense)";
        
        toast.innerHTML = `
            <div class="toast-header">
                <span class="toast-icon" style="color: var(--defense); font-size: 16px;">🛡️</span>
                <span class="toast-title" style="margin-left: 6px; color: var(--defense); font-weight: 700;">Defense Phase Activated!</span>
            </div>
            <div class="toast-body">
                Offense is locked! Rerolls have been reset to <strong>2</strong> (do not carry over). It's time to build your defense!
            </div>
        `;
        
        container.appendChild(toast);
        
        // Remove toast after 4 seconds
        setTimeout(() => {
            toast.classList.add("animate-slide-out");
            const onAnimationEnd = () => {
                toast.remove();
                if (container.children.length === 0) {
                    container.remove();
                }
            };
            toast.addEventListener("animationend", onAnimationEnd, { once: true });
        }, 4000);
    }
}

// Instantiate game on page load
window.addEventListener("load", () => {
    window.game = new CollegeGame();
});
