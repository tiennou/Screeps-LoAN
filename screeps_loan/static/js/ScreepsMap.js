
// Yellow, Blue, Green, Purple, Pink, Red, Orange
var DEFAULT_COLORS = [
    '#FFFF00',
    '#63f0e5',
    '#00FF00',
    '#C055DD',
    '#f2569b',
    '#9e94d9',
    '#ad0f0f',
    '#FF8500',
    '#3d7ee6',
    '#54D579',
    '#FF00FF',
    '#eb6161',
    '#FFA500',
    '#5078bd',
    '#CCFF88',
    '#0088AA',
    '#00EE88',
    '#BB00BB',
    '#ddcdf0',
    '#FF33EE',
    '#ff4500',
    '#FFCC44',
    '#DDA0DD',
    '#54D579',
];

var DEFAULT_UNCATEGORIZED = '#555'

function parseDate(str) {
    try {
        return Date.parse(str);
    } catch (e) { }
    return null;
}

function formatDate(str) {
    const stamp = parseDate(str);
    if (stamp) {
        return new Date(stamp).toLocaleString();
    }
    return null;
}

var ScreepsMap = (function () {
    function ScreepsMap(config) {
        this.spinnerHostId = config.spinnerHostId;
        this.mapHostId = config.mapHostId;
        this.legendHostId = config.legendHostId;
        this.roomTooltipHostId = config.roomTooltipHostId;

        this.terrainUri = config.terrainUri;
        this.region = config.region;
        this.shard = config.shard ? config.shard : 'shard0';
        this.legendUrlPrefix = config.legendUrlPrefix
        this.groupType = 'alliance'
        this.userColors = {}
        this.allianceColors = {}
        this.allianceColors['unaffiliated'] = DEFAULT_UNCATEGORIZED
        this.style = config.style || {};

        this.config = config;
        this.config.showTerrain ??= true;
        this.config.showZones ??= true;
        this.config.showControl ??= true;
        this.config.showLabels ??= true;
    }

    ScreepsMap.prototype.setRoomData = function (roomData) {
        this.roomData = roomData;
    }

    ScreepsMap.prototype.setAllianceData = function (allianceData) {
        this.allianceData = allianceData;

        this.allianceData['unaffiliated'] = {
            'name': 'unaffiliated',
            'members': ["neutral"],
            'color': DEFAULT_UNCATEGORIZED
        };

        // build user -> alliance lookup
        this.userAlliance = {};
        for (let allianceName in this.allianceData) {
            let alliance = this.allianceData[allianceName];
            for (let userIndex in alliance.members) {
                let userName = alliance.members[userIndex];
                this.userAlliance[userName] = allianceName;
            }
        }
    }

    ScreepsMap.prototype.setZoneData = function (zoneData) {
        this.zoneData = {}
        for (let type of ["novice", "respawnArea"]) {
            for (let [tick, rooms] of Object.entries(zoneData[type])) {
                for (const roomName of rooms) {
                    this.zoneData[roomName] = { type: type, end: tick };
                }
            }
        }
    }

    ScreepsMap.prototype.setBattleData = function (battleData) {
        this.battleData = {};
        for (let battle of battleData.records) {
            if (battle.shard !== this.shard) continue;
            const { room } = battle;
            this.battleData[room] ??= [];
            this.battleData[room].push(battle);
        }
    }

    ScreepsMap.prototype.setData = function (roomData, allianceData) {
        this.setRoomData(roomData);
        this.setAllianceData(allianceData);
    }

    ScreepsMap.prototype.setAlliance = function (alliance) {
        this.alliance = alliance
    }

    ScreepsMap.prototype.allowUnaffiliated = function () {
        this.allowUnaffiliated = true
    }

    ScreepsMap.prototype.disableLabels = function () {
        this.disableLabels = true
    }

    ScreepsMap.prototype.setGroupType = function (type) {
        this.groupType = type
        if (type == 'user') {
            this.legendUrlPrefix = 'https://screeps.com/a/#!/profile/'
        }
    }

    ScreepsMap.prototype.setSpinnerVisible = function (show) {
        let container = document.getElementById(this.spinnerHostId);
        container.className = (show)
            ? "ScreepsMapFlex spinner"
            : "ScreepsMapFlex";
    }

    ScreepsMap.prototype.render = function () {
        this.setSpinnerVisible(true);

        this.loadTerrainAsync(function () {
            let regionBounds = this.getRegionBounds();

            let mapAdjust = (this.style['room-padding'] || 0) * ScreepsConstants.RoomSize;
            let mapBounds = [
                [
                    regionBounds[0][0] + mapAdjust,
                    regionBounds[0][1] - mapAdjust,
                ],
                [
                    regionBounds[1][0] - mapAdjust,
                    regionBounds[1][1] + mapAdjust,
                ]
            ];

            if (this.map) {
                this.map.remove();
            }
            this.map = L.map(this.mapHostId, {
                crs: L.CRS.Simple,
                minZoom: -3.5,
                maxZoom: 1,
                zoomSnap: 0.1,
                zoomDelta: 0.75,
                attributionControl: false
            });
            this.map.fitBounds(mapBounds);

            let terrainLayer = L.imageOverlay(this.terrainUri, regionBounds);
            let zoneLayer = (new L.LayerGroup());
            let controlLayer = (new L.LayerGroup());
            let battleLayer = (new L.LayerGroup());
            let labelLayer = (new L.LayerGroup());

            if (this.groupType === 'battle') {
                this.drawBattleLayer(battleLayer);
            } else {
                this.drawRoomLayer(controlLayer);
                this.drawLabelLayer(labelLayer);
            }
            this.drawZoneLayer(zoneLayer);

            if (this.config.showTerrain) {
                terrainLayer.addTo(this.map);
            }
            if (this.config.showZones) {
                zoneLayer.addTo(this.map);
            }
            if (this.groupType === 'battle') {
                battleLayer.addTo(this.map);
            } else {
                if (this.config.showControl) {
                    controlLayer.addTo(this.map);
                }
                if (this.config.showLabels) {
                    labelLayer.addTo(this.map);
                }
            }

            let overlays = {
                "Terrain": terrainLayer,
                "Zones": zoneLayer,
            };
            if (this.groupType === 'battle') {
                overlays["Battles"] = battleLayer;
            } else {
                overlays["Rooms"] = controlLayer;
                overlays["Labels"] = labelLayer;
            }
            L.control.layers({}, overlays).addTo(this.map);

            switch (this.groupType) {
                case 'user':
                    this.drawUserLegend();
                    break;
                case 'alliance':
                    this.drawAllianceLegend();
                    break;
                default:
                    break;
            }

            this.createRoomInfoControl();
            if (this.config.showControl) {
                this.bindRclFilter(controlLayer);
            }

            this.setSpinnerVisible(false);
        }.bind(this));
    }

    ScreepsMap.prototype.createRoomInfoControl = function () {
        let roomInfoControl = document.getElementById(this.roomTooltipHostId);
        let self = this;
        roomInfoControl.update = function (e, roomName) {
            if (roomName) {
                let toolRect = this.getBoundingClientRect();
                this.style.left = String(e.originalEvent.clientX + 15) + "px";
                this.style.top = String(e.originalEvent.clientY - Math.floor(toolRect.height / 2)) + "px";
                this.style.display = "block";

                if (this.currentRoom === roomName) return;
                self.populateTooltip(this, roomName);

            } else {
                this.style.display = "none";
            }

            this.currentRoom = roomName;
        };

        this.map.on({
            click: function (e) {
                if (this.map.disableMouse) return;

                let worldPosition = this.worldPositionFromMapCoords(e.latlng);

                if (!this.region.worldPositionInBounds(worldPosition.x, worldPosition.y)) return;

                let roomName = this.region.worldPositionToRoomName(worldPosition.x, worldPosition.y);
                let link;
                if (this.groupType === 'battle') {
                    const lastBattle = this.battleData[roomName][this.battleData[roomName].length - 1];
                    if (!lastBattle) return;
                    const { firstpvptick } = lastBattle;
                    link = `https://screeps.com/a/#!/history/${this.shard}/${roomName}?t=${firstpvptick}`;
                } else {
                    link = `https://screeps.com/a/#!/room/${this.shard}/${roomName}`;
                }
                window.open(link, "loan-launch-tab");
            }.bind(this),

            mouseover: function (e) {
                if (this.map.disableMouse) return;

                let worldPosition = this.worldPositionFromMapCoords(e.latlng);

                let roomName;
                if (this.region.worldPositionInBounds(worldPosition.x, worldPosition.y)) {
                    roomName = this.region.worldPositionToRoomName(worldPosition.x, worldPosition.y);
                }

                roomInfoControl.update(e, roomName);
            }.bind(this),

            mousemove: function (e) {
                if (this.map.disableMouse) return;

                let worldPosition = this.worldPositionFromMapCoords(e.latlng);

                let roomName;
                if (this.region.worldPositionInBounds(worldPosition.x, worldPosition.y)) {
                    roomName = this.region.worldPositionToRoomName(worldPosition.x, worldPosition.y);
                }

                roomInfoControl.update(e, roomName);
            }.bind(this),

            mouseout: function (e) {
                roomInfoControl.update(e, null);
            }.bind(this),
        });
    }

    ScreepsMap.prototype.bindRclFilter = function (controlLayer) {
        let rclControl = new L.Control.SliderControl({
            minValue: 0,
            maxValue: 8,
            className: "rcl-control",
            label: "RCL"
        });

        $(rclControl).on("update", () => {
            let minRcl = rclControl.lowValue;
            let maxRcl = rclControl.highValue;
            for (let rcl = 0; rcl <= 8; rcl++) {
                if (rcl < minRcl || rcl > maxRcl) {
                    controlLayer.removeLayer(this.rclLayers[rcl]);
                } else {
                    controlLayer.addLayer(this.rclLayers[rcl]);
                }
            }
        });

        rclControl.addTo(this.map);

        this.map.on('overlayremove', (overlay) => {
            if (overlay.layer === controlLayer) {
                rclControl.getContainer().style.display = "none";
            }
        });
        this.map.on('overlayadd', (overlay) => {
            if (overlay.layer === controlLayer) {
                rclControl.getContainer().style.display = "block";
            }
        });
    }

    /**
     *
     * @param {HTMLDivElement} tooltip
     * @param {string} className
     * @param {string} [label] if unspecified, won't actually create the element
     */
    ScreepsMap.prototype.getTooltipElement = function (tooltip, className, label) {
        let inner = tooltip.querySelector('dl')
        if (!inner && label) {
            inner = document.createElement('dl');
            tooltip.appendChild(inner);
        }

        let element = tooltip.querySelector(`.${className}`);
        if (!element && label) {
            const dt = document.createElement('dt');
            dt.innerHTML = `${label}:`;
            inner.appendChild(dt);
            element = document.createElement('div');
            element.className = className;
            const removeMeth = element.remove;
            element.remove = function () {
                dt.remove();
                removeMeth.call(element);
            }
            inner.appendChild(element)
        }
        return element;
    }

    /**
     *
     * @param {HTMLDivElement} tooltip
     * @param {string} roomName
     */
    ScreepsMap.prototype.populateTooltip = function (tooltip, roomName) {
        this.getTooltipElement(tooltip, 'roomName', "Room").innerHTML = roomName;

        if (this.groupType === 'battle') {
            if (this.battleData[roomName]) {
                const battle = this.battleData[roomName][this.battleData[roomName].length - 1];
                const { classification, firstseen, firstpvptick, lastseen, lastpvptick } = battle;
                this.getTooltipElement(tooltip, 'battleClass', "Class").innerHTML = classification;
                const first = formatDate(firstseen);
                if (first) {
                    this.getTooltipElement(tooltip, 'battleSeen', "Seen").innerHTML = first;
                } else {
                    this.getTooltipElement(tooltip, 'battleSeen')?.remove();
                }
                this.getTooltipElement(tooltip, 'battleTick', "Tick").innerHTML = firstpvptick;
                const last = formatDate(lastseen);
                if (last) {
                    this.getTooltipElement(tooltip, 'battleLastSeen', "Last Seen").innerHTML = last;
                } else {
                    this.getTooltipElement(tooltip, 'battleLastSeen')?.remove();
                }
                this.getTooltipElement(tooltip, 'battleLastTick', "Last Tick").innerHTML = lastpvptick;
            } else {
                this.getTooltipElement(tooltip, 'battleClass')?.remove();
                this.getTooltipElement(tooltip, 'battleSeen')?.remove();
                this.getTooltipElement(tooltip, 'battleTick')?.remove();
                this.getTooltipElement(tooltip, 'battleLastSeen')?.remove();
                this.getTooltipElement(tooltip, 'battleLastTick')?.remove();
            }
            return;
        }

        if (this.roomData[roomName]) {
            if (this.roomData[roomName].level) {
                this.getTooltipElement(tooltip, 'roomType', "Type").innerHTML = "Owned";
                this.getTooltipElement(tooltip, 'roomLevel', "Level").innerHTML = this.roomData[roomName].level;
            } else {
                this.getTooltipElement(tooltip, 'roomType', "Type").innerHTML = "Reserved";
                this.getTooltipElement(tooltip, 'roomLevel')?.remove();
            }
            this.getTooltipElement(tooltip, 'roomOwner', "Owner").innerHTML = this.roomData[roomName].owner;

            let allianceName = this.userAlliance[this.roomData[roomName].owner];
            if (allianceName && this.allianceData[allianceName]) {
                this.getTooltipElement(tooltip, 'roomAlliance', "Alliance").innerHTML = this.allianceData[allianceName].name;
            } else {
                this.getTooltipElement(tooltip, 'roomAlliance')?.remove();
            }
        } else {
            this.getTooltipElement(tooltip, 'roomType', "Type").innerHTML = "Unowned";
            this.getTooltipElement(tooltip, 'roomOwner')?.remove();
            this.getTooltipElement(tooltip, 'roomAlliance')?.remove();
            this.getTooltipElement(tooltip, 'roomLevel')?.remove();
        }
        if (this.zoneData[roomName]) {
            const { type, end } = this.zoneData[roomName];
            this.getTooltipElement(tooltip, 'zoneType', "Zone").innerHTML = `${type === "novice" ? "Novice" : "Respawn"}`;
            this.getTooltipElement(tooltip, 'zoneEnd', "Zone end").innerHTML = new Date(Number(end)).toLocaleString();
        } else {
            this.getTooltipElement(tooltip, 'zoneType', "Zone")?.remove();
            this.getTooltipElement(tooltip, 'zoneEnd', "Zone end")?.remove();
        }
    }

    ScreepsMap.prototype.drawAllianceLegend = function () {
        let container = document.getElementById(this.legendHostId);
        let output = '<h3>Legend:</h3>';
        output += '<ul class="colorKeyList">';

        let alliance_shortnames = Object.keys(this.allianceData)
        alliance_shortnames.sort(function (a, b) {
            if (this.allianceData[a].name == 'unaffiliated') {
                return 1;
            }
            if (this.allianceData[b].name == 'unaffiliated') {
                return -1;
            }
            if (this.allianceData[a].name < this.allianceData[b].name)
                return -1;
            if (this.allianceData[a].name > this.allianceData[b].name)
                return 1;
            return 0;
        }.bind({ allianceData: this.allianceData }))

        for (let allianceName of alliance_shortnames) {
            output += '<div id=#colorkey_alliance_' + allianceName + '>'
            output += '  <li class="colorKeyItem">';
            output += '    <span class="colorBox" style="background-color: ' + this.getAllianceColor(allianceName) + ';"></span>';
            if (this.allianceData[allianceName].url) {
                output += '    <a href="' + this.allianceData[allianceName].url + '">'
            } else if (this.allianceData[allianceName].abbreviation) {
                output += '    <a href="' + this.legendUrlPrefix + this.allianceData[allianceName].abbreviation + '">'
            }
            output += '      <span class="colorLabel">' + this.allianceData[allianceName].name + '</span>';
            output += '    </a>';
            output += '  </li>';
            output += '</div>';
        }

        if (alliance_shortnames.length === 0) {
            output += '<span class="colorLabel">No one found</span>';
        }

        output += '</ul>';
        container.innerHTML = output;
    }

    ScreepsMap.prototype.drawUserLegend = function () {
        let container = document.getElementById(this.legendHostId);
        let output = '<h3>Legend:</h3>';
        output += '<ul class="colorKeyList">';
        for (let user in this.userAlliance) {
            if (!!this.alliance && this.alliance != this.userAlliance[user]) {
                continue
            }
            output += '<div id=#colorkey_alliance_' + user + '>'
            output += '  <li class="colorKeyItem">';
            output += '    <span class="colorBox" style="background-color: ' + this.getUserColor(user) + ';"></span>';
            output += '    <a href="' + this.legendUrlPrefix + user + '">'
            output += '      <span class="colorLabel">' + user + '</span>';
            output += '    </a>';
            output += '  </li>';
            output += '</div>';
        }
        output += '</ul>';
        container.innerHTML = output;
    }


    ScreepsMap.prototype.loadTerrainAsync = function (callback) {
        this.terrainImage = new Image();
        this.terrainImage.src = this.terrainUri;
        this.terrainImage.onload = callback;
    }

    ScreepsMap.prototype.getZoneColor = function (zoneName) {
        return zoneName === "novice" ? "#00FF00" : "#006AFF";
    }

    ScreepsMap.prototype.drawRoomLayer = function (controlLayer) {
        let rclLayers = {};
        for (let i = 0; i <= 8; i++) {
            rclLayers[i] = new L.LayerGroup();
            controlLayer.addLayer(rclLayers[i]);
        }

        for (let roomName in this.roomData) {
            let room = this.roomData[roomName];
            let rect = this.region.getRoomRect(roomName);
            let bounds = this.rectToBounds(rect);

            if (room.owner) {
                let targetLayer = rclLayers[room.level];
                let fillColor = this.getUserColor(room.owner);
                let fillOpacity = (room.level !== 0) ? 0.75 : 0.5;

                L.rectangle(bounds, { stroke: false, fillColor: fillColor, fillOpacity: fillOpacity, interactive: false }).addTo(targetLayer);
            }
        }

        this.rclLayers = rclLayers;
    }

    ScreepsMap.prototype.drawZoneLayer = function (zoneLayer) {
        let zoneLayers = {};
        for (let type of ["novice", "respawnArea"]) {
            zoneLayers[type] = new L.LayerGroup();
            zoneLayer.addLayer(zoneLayers[type]);
        }

        for (let roomName in this.zoneData) {
            const { type } = this.zoneData[roomName];
            let rect = this.region.getRoomRect(roomName);
            let bounds = this.rectToBounds(rect);
            L.rectangle(bounds, {
                stroke: false,
                fillColor: this.getZoneColor(type),
                fillOpacity: 0.3,
                interactive: false,
            }).addTo(zoneLayers[type]);
        }

        this.zoneLayers = zoneLayers;
    }

    ScreepsMap.prototype.drawBattleLayer = function (battleLayer) {
        for (let [_, battles] of Object.entries(this.battleData)) {
            for (const battle of battles) {
                const { room, classification } = battle;
                let rect = this.region.getRoomRect(room);
                let bounds = this.rectToBounds(rect);
                L.rectangle(bounds, {
                    stroke: false,
                    fillColor: this.getConflictColor(classification),
                    fillOpacity: 0.3,
                    interactive: false,
                }).addTo(battleLayer);
            }
        }
    }

    ScreepsMap.prototype.getConflictColor = function (cls) {
        const colors = [
            "#33cc33",
            "#3399cc",
            "#3366cc",
            "#cc3333",
            "#ffffff",
        ];
        return colors[cls];
    }

    ScreepsMap.prototype.drawLabelLayer = function (labelLayer) {
        let groups = this.findGroups(10);
        for (let group of groups) {
            let allianceName = this.groupType == 'user' ? this.userAlliance[group.labelName] : group.labelName
            let alliance = this.allianceData[allianceName];
            if (!alliance || alliance.name == 'unaffiliated') {
                if (!this.allowUnaffiliated) {
                    continue
                }
            }
            if (!!this.alliance) {
                if (!alliance) {
                    continue
                }
                if (this.alliance !== alliance.abbreviation) {
                    continue
                }
            }
            let center = this.geometricCenter(group.rooms);
            if (this.groupType == 'user') {
                var title = group.labelName
                var color = this.getUserColor(group.labelName)
            } else {
                if (!alliance) {
                    continue
                }
                var title = !!alliance.abbreviation ? alliance.abbreviation : alliance.name;
                var color = this.getAllianceColor(group.labelName)
            }
            L.marker([~center.y, center.x], {
                icon: L.divIcon({
                    className: 'alliance-label',
                    html: "<span style='color:" + color + "'>" + title + "</span>",
                    interactive: false
                })
            }).addTo(labelLayer);
        }
    }

    ScreepsMap.prototype.geometricCenter = function (rooms) {
        // average top left coordinates
        let sum = { x: 0, y: 0 };
        for (let name of rooms) {
            let rect = this.region.getRoomRect(name);
            sum.x += rect.left;
            sum.y += rect.top;
        }
        sum.x = Math.floor(sum.x / rooms.length);
        sum.y = Math.floor(sum.y / rooms.length);

        // adjust for center
        sum.x = Math.floor((sum.x + .5 * ScreepsConstants.RoomSize));
        sum.y = Math.floor((sum.y + .5 * ScreepsConstants.RoomSize));

        return sum;
    }

    ScreepsMap.prototype.findGroups = function (radius) {
        let results = [];
        let checked = {};

        let topLeft = this.region.roomNameToXY(this.region.topLeft);
        let bottomRight = this.region.roomNameToXY(this.region.bottomRight);

        // iterate over each room
        for (let y = topLeft.y; y <= bottomRight.y; y++) {
            for (let x = topLeft.x; x <= bottomRight.x; x++) {
                let roomName = this.region.xyToRoomName(x, y);

                // ignore rooms that were already scanned by the loop below
                if (checked[roomName]) continue;
                checked[roomName] = true;

                // ignore unclaimed rooms
                let room = this.roomData[roomName];
                if (!room || !room.owner) continue;

                // ignore rooms owned by unaffiliated players
                let allianceName = this.userAlliance[room.owner];
                if (allianceName === "unaffiliated" && !this.allowUnaffiliated) continue;

                if (this.groupType == 'user') {
                    var labelName = room.owner
                } else {
                    var labelName = allianceName
                }


                // start building a new group
                let rooms = [roomName];

                // Check every room in a (2*radius+1)x(2*radius+1) square around the current room. If
                // we find a room owned by the current alliance, push it onto the stack to be searched next.
                let groupChecked = {};
                let toCheck = [roomName];
                while (toCheck.length > 0) {
                    let checkName = toCheck.pop();
                    let xy = this.region.roomNameToXY(checkName);

                    let minXY = { "x": Math.max(topLeft.x, xy.x - radius), "y": Math.max(topLeft.y, xy.y - radius) };
                    let maxXY = { "x": Math.min(bottomRight.x, xy.x + radius), "y": Math.min(bottomRight.y, xy.y + radius) };
                    for (let y = minXY.y; y <= maxXY.y; y++) {
                        for (let x = minXY.x; x <= maxXY.x; x++) {
                            if (y === minXY.y && x <= xy.x) continue;

                            let curName = this.region.xyToRoomName(x, y);
                            let curRoom = this.roomData[curName];
                            if (!curRoom || !curRoom.owner) continue;

                            if (groupChecked[curName] || checked[curName]) continue;
                            groupChecked[curName] = true;

                            var curLabel = this.groupType == 'user' ? curRoom.owner : this.userAlliance[curRoom.owner];
                            if (this.groupType != 'user') {
                                let curAlliance = this.userAlliance[curRoom.owner];
                                if (curAlliance === "unaffiliated" && !this.allowUnaffiliated) continue;
                            }
                            if (curLabel === labelName) {
                                checked[curName] = true;
                                toCheck.push(curName);
                                rooms.push(curName);
                            }
                        }
                    }
                }

                // save the completed group
                results.push({
                    labelName,
                    rooms
                });
            }
        }

        return results;
    }

    ScreepsMap.prototype.getRegionBounds = function () {
        let regionRect = this.region.getRect();
        return this.rectToBounds(regionRect);
    }

    ScreepsMap.prototype.rectToBounds = function (rect) {
        return [[~rect.top, rect.left], [~rect.bottom, rect.right]];
    }

    ScreepsMap.prototype.worldPositionFromMapCoords = function (latlng) {
        return {
            x: latlng.lng,
            y: ~latlng.lat
        };
    }

    ScreepsMap.prototype.getUserColor = function (user) {
        let allianceName = this.userAlliance[user];
        if (!this.allowUnaffiliated) {
            if (!allianceName) {
                return DEFAULT_UNCATEGORIZED
            }
        }
        if (!!this.alliance && this.alliance != allianceName) {
            return DEFAULT_UNCATEGORIZED
        }

        if (this.groupType == 'user') {
            if (!this.userColors[user]) {
                this.userColors[user] = this.getRandomColor(user)
            }
            return this.userColors[user]
        }
        return this.getAllianceColor(allianceName)
    }

    ScreepsMap.prototype.getAllianceColor = function (allianceName) {
        if (!allianceName || !this.allianceData[allianceName]) {
            allianceName = 'unaffiliated'
        }

        if (!this.allianceColors[allianceName]) {
            this.allianceColors[allianceName] = this.getRandomColor(this.allianceData[allianceName].name)
        }
        return this.allianceColors[allianceName]
    }

    ScreepsMap.prototype.getRandomColor = function (seed = false) {

        if (!seed) {
            if (!this.seed) {
                this.seed = 1000
            } else {
                this.seed += 1
            }
            seed = this.seed
        }

        return randomColor({
            luminosity: 'light',
            hue: 'random',
            seed: seed
        });
    }

    return ScreepsMap;
})();

/*
* Workaround for 1px lines appearing in some browsers due to fractional transforms
* and resulting anti-aliasing.
* https://github.com/Leaflet/Leaflet/issues/3575
*/
(function () {
    var originalInitTile = L.GridLayer.prototype._initTile
    L.GridLayer.include({
        _initTile: function (tile) {
            originalInitTile.call(this, tile);

            var tileSize = this.getTileSize();

            tile.style.width = tileSize.x + 1 + 'px';
            tile.style.height = tileSize.y + 1 + 'px';
        }
    });
})()
