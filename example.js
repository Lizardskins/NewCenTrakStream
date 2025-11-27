let tagStreamingFields = [1, 9, 80, 97, 10, 54, 63, 44, 55, 56, 45, 11, 14, 15, 4, 16, 18, 19, 48, 49, 3, 8, 60]
let monitorStreamingFields = [1, 4, 9, 11, 12, 13, 38, 39, 40, 8]
let tagStreamingObject = [
    {
        sNo: 1,
        bytes: 1,
        index: 0,
        Name: "PaddingByte",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 2,
        bytes: 9,
        index: 1,
        Name: "defaultStreamingFields",
        parse: function (msg) {
            let dsf = {}
            // dsf.raw = msg
            // console.log(msg, msg.slice(0, 9));
            let tag_RFID = msg.slice(0, 9).readUInt32LE()
            // console.log(tag_RFID);
            let sliced = tag_RFID << 1
            // console.log(sliced);
            let tag = sliced >>> 9
            // console.log(tag);
            dsf.tagId = tag
            // tag.tagId = tag

            let rssi = msg.slice(4, 5).toString('hex')
            // console.log(rssi);
            rssi = parseInt(rssi, 16)
            // console.log(rssi);
            if (rssi >= 128) {
                rssi = (rssi - 256) / 2.0 - 78;
            } else {
                rssi = rssi / 2.0 - 78;
            }
            dsf.rssi = rssi

            let buf = msg.slice(5, 8)
            // console.log(buf);
            let buf2 = new Buffer(0x01) //deprecated
            // let buf2 = Buffer.from(0x01);
            let mont = Buffer.concat([buf, buf2])
            let monitor = mont.readUInt32LE()
            if (monitor === 0) {
                dsf.monitorId = monitor
            } else {

                // console.log('monitor', monitor);
                monitor ^= (1 << 23)
                // console.log(monitor);
                monitor ^= (1 << 22)
                // console.log(monitor);
                dsf.monitorId = monitor
            }
            // Command Bit
            // console.log(msg.slice(8, 9));
            dsf.command = msg.slice(8, 9).toString('hex')

            //Buttons,Motion,Rety,LBI
            let buttons = msg.slice(9, 10).toString('hex');
            buttons = parseInt(buttons, 16).toString(2).padStart(8, '0');
            // console.log(buttons);
            dsf.button1 = parseInt(buttons[3]);
            dsf.button2 = parseInt(buttons[2]);
            dsf.button3 = parseInt(buttons[1]);
            dsf.button4 = parseInt(buttons[0]);
            dsf.inMotion = parseInt(buttons[4]);
            switch (buttons[5] + buttons[6]) {
                case "01":
                    dsf.retry = 1
                    break;
                case "10":
                    dsf.retry = 2
                    break;
                case "11":
                    dsf.retry = 3
                    break;
                default:
                    break;
            }
            // dsf.rawMessage = msg.toString('hex');
            // tag.retry = parseInt(buttons[5] + buttons[6]);
            dsf.lbi = parseInt(buttons[7]);
            if (dsf.lbi) {
                // console.log(buttons, dsf, tag);
            }

            return dsf
        }
    },
    {
        sNo: 3,
        bytes: 3,
        index: 2,
        Name: "TagRFID",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 4,
        bytes: 2,
        index: 3,
        Name: "Command",
        parse: function (msg) {
            if (tag.tagid === 1455740 || tag.tagid === 1471287 || tag.tagid === 2650146) {
                // console.log(tag.tagid);
                let command = msg.toString('hex');
                // console.log('pre', command);
                // console.log('pre', parseInt(command, 16).toString(2).padStart(8, '0'));
                command = command[2] + command[3] + command[0] + command[1];
                // console.log('post', command);
                // console.log(parseInt(command[0] + command[1]));
                // console.log( parseInt(command, 16));
                // console.log('post', parseInt(command, 16).toString(2).padStart(8, '0'));
                let test
                let tempHex1 = msg.toString('hex');
                tempHex1 = tempHex1[2] + tempHex1[3] + tempHex1[0] + tempHex1[1]
                let tempInt = parseInt(tempHex1, 16)
                test = tempInt / 1024
                // console.log('tempHex', test);
                // console.log(msg.toString('hex'));
                return command
            }
        }
    },
    {
        sNo: 5,
        bytes: 1,
        index: 4,
        Name: "RSSI",
        parse: function (msg) {
            //rssi
            let rssi = msg.toString('hex')
            rssi = parseInt(rssi, 16)
            // console.log(rssi);
            if (rssi >= 128) {
                rssi = (rssi - 256) / 2.0 - 78;
            } else {
                rssi = rssi / 2.0 - 78;
            }
            return rssi
        }
    },
    {
        sNo: 6,
        bytes: 1,
        index: 5,
        Name: "LBI-Retry-Motion Flag-Keys",
        parse: function (msg) {
            // console.log(tag.defaultStreamingFields.tagId, msg.toString('hex'));
            if (tag.defaultStreamingFields.tagId == 2643933) {
                console.log(tag.defaultStreamingFields.tagId, msg.toString('hex'));
            }
            return msg
        }
    },
    {
        sNo: 7,
        bytes: 1,
        index: 6,
        Name: "Alive-Index",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 8,
        bytes: 3,
        index: 7,
        Name: "MonitorRFId",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 9,
        bytes: 2,
        index: 8,
        Name: "IRID",
        parse: function (msg) {
            let irid = msg.toString('hex');
            irid = irid[2] + irid[3] + irid[0] + irid[1];
            irid = parseInt(irid, 16);
            // console.log(irid);
            return irid
        }
    },
    {
        sNo: 10,
        bytes: 1,
        index: 9,
        Name: "Type-DIMIR",
        parse: function (msg) {
            // 0 Asset Tag
            // 1 Staff Tag
            // 2 Temperature Tag
            // 3 RUN Unit
            // 4 Humidity Tag
            // 5 G2 Temperature / Display / EM Tag
            // 6 MM Asset tag
            // 7 Temp tag
            // 8 MM Staff tag
            // 9 Patient tag
            // 10 Asset tag
            // 11 Staff tag
            // 12 Humidity without Temp
            // 13 Humidity with Temp
            // 14 Disposable tag
            // 15 Mini Asset tag
            // 16 Micro Asset Tag
            // 17 Patient Tag MM
            // 18 Reserved
            // 19 Mini Patient tag
            // 20 Micro Patient Tag
            // 21 ERU Tag
            // 22 SABLE Tag
            // 23 EM Wi-Fi Display Tag 24 Mother Tag
            // 25 Umbilical Tag
            // 26 Cut band Tag.
            // 27 Controller Test Tag 28 Interface Tag
            // 29 Mini Dura Tag
            // console.log(tag.tagid, msg, (msg.toString('hex')))
            // console.log(msg, msg.toString('hex'));

            msg = msg.toString('hex')

            let binary = parseInt(msg, 16).toString(2).padStart(8, '0')
            const part1 = binary.slice(0, 4); // First 4 bits
            const part2 = binary.slice(4, 7); // Last 4 bits
            // console.log(msg,binary,part1,part2,parseInt(part1,2),parseInt(part2,2));
            // console.log(parseInt(part2, 2));
            msg = parseInt(part2, 2);

            // console.log(msg);
            if (msg == 1) {
                // console.log('message',msg);
            }
            return msg
        }
    },
    {
        sNo: 11,
        bytes: 2,
        index: 10,
        Name: "TemperatureProbe1",
        parse: function (msg) {

            let tempObj = {}
            let tempHex1 = msg.toString('hex');
            tempHex1 = tempHex1[2] + tempHex1[3] + tempHex1[0] + tempHex1[1]
            let tempInt = parseInt(tempHex1, 16)

            // if (tag.tagid === 2649366 || tag.tagid === 1362840 || tag.tagid === 2649495 || tag.tagid === 2649642 || tag.tagid === 2649876) {
            //     console.log(tag.tagid, tempInt, tempInt / 100);
            // }
            tempObj.temp1 = tempInt / 100

            if (tempObj.temp1 > 100) {
                let negTemp = msg.toString('hex')
                negTemp = negTemp[2] + negTemp[3] + negTemp[0] + negTemp[1]
                let binary = parseInt(negTemp, 16).toString(2).padStart(8, '0')
                // console.log(binary);
                let goodBinary = ""
                for (let i = 0; i < binary.length; i++) {
                    let invert
                    if (binary[i] === "0") {
                        invert = "1"
                    } else {
                        invert = "0"
                    }
                    goodBinary = goodBinary + invert
                }
                // console.log('temp1', goodBinary, parseInt(goodBinary, 2) / -100);
                tempObj.temp1 = (parseInt(goodBinary, 2) / -100)
                // if (tag.tagid === 2649366 || tag.tagid === 1362840 || tag.tagid === 2649495 || tag.tagid === 2649642 || tag.tagid === 2649876) {
                //     console.log(tag.tagid, parseInt(goodBinary, 2) / -100);
                // }
            }

            // console.log(msg.slice(110, 112).readUIntLE(0, 2).toString(16));

            // console.log(msg.slice(110, 112))
            // console.log(parseFloat(tempInt / 100))
            return tempObj.temp1
        }
    },
    {
        sNo: 12,
        bytes: 2,
        index: 11,
        Name: "StrongestStarID",
        parse: function (msg) {
            let star = msg.toString('hex');
            star = star[2] + star[3] + star[0] + star[1];
            star = parseInt(star, 16);
            return star
        }
    },
    {
        sNo: 13,
        bytes: 1,
        index: 12,
        Name: "Version",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 14,
        bytes: 6,
        index: 13,
        Name: "Reserved",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 15,
        bytes: 2,
        index: 14,
        Name: "AssociatedStarID",
        parse: function (msg) {
            let star = msg.toString('hex');
            star = star[2] + star[3] + star[0] + star[1];
            star = parseInt(star, 16);
            return star
        }
    },
    {
        sNo: 16,
        bytes: 2,
        index: 15,
        Name: "ReceivedStarID",
        parse: function (msg) {

            //received Star
            let star3 = msg.toString('hex');
            star3 = star3[2] + star3[3] + star3[0] + star3[1];
            star3 = parseInt(star3, 16);
            // starCollection.findOne({ starId: star3 }, function (err, star) { tag.starName = star.starName })
            // tag.receivedStarID = star3;
            // if (star3 != 100) {
            //     tag.starCovered = true
            // };
            return star3
        }
    },
    {
        sNo: 17,
        bytes: 4,
        index: 16,
        Name: "Time",
        parse: function (msg) {
            //  Log TimeStamp
            // console.log(msg);
            let tobj = {}
            let time = msg.toString('hex')
            // tobj.raw = time
            // console.log(time);

            time = time[6] + time[7] + time[4] + time[5] + time[2] + time[3] + time[0] + time[1]
            time = parseInt(time, 16)

            // tobj.reportTime = moment.unix(time).format("YYYY-MM-DD hh:mm:ss A Z");
            time = moment.unix(time).format("YYYY-MM-DD hh:mm:ss A Z");
            time = new Date(time)
            // time = time.toISOString()
            // console.log(time);
            // tobj.unix = moment(time)

            return time
        }
    },
    {
        sNo: 18,
        bytes: 4,
        index: 17,
        Name: "FloorID",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 19,
        bytes: 4,
        index: 18,
        Name: "X",
        parse: function (msg) {
            x = msg.readFloatLE()
            return x
        }
    },
    {
        sNo: 20,
        bytes: 4,
        index: 19,
        Name: "Y",
        parse: function (msg) {
            y = msg.readFloatLE()
            return y
        }
    },
    {
        sNo: 21,
        bytes: 4,
        index: 20,
        Name: "Z",
        parse: function (msg) {
            z = msg.readFloatLE()
            return z
        }
    },
    {
        sNo: 22,
        bytes: 4,
        index: 25,
        Name: "VendorId",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 23,
        bytes: 4,
        index: 26,
        Name: "MacId",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 24,
        bytes: 4,
        index: 27,
        Name: "ObjectId",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 25,
        bytes: 4,
        index: 28,
        Name: "ConfidenceFactor",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 26,
        bytes: 4,
        index: 30,
        Name: "ControllerIP",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 27,
        bytes: 4,
        index: 32,
        Name: "ChangedOn",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 28,
        bytes: 4,
        index: 38,
        Name: "Latitude",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 29,
        bytes: 4,
        index: 39,
        Name: "Longitude",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 30,
        bytes: 2,
        index: 41,
        Name: "Module Version",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 31,
        bytes: 2,
        index: 44,
        Name: "HumidityPercent",
        parse: function (msg) {
            // log humidity 
            let humidity = msg.toString('hex')
            hHex = humidity[2] + humidity[3] + humidity[0] + humidity[1]
            let hInt = parseInt(hHex, 16)
            temp2 = hInt / 100

            return temp2
        }
    },
    {
        sNo: 32,
        bytes: 4,
        index: 45,
        Name: "OfflineTempTimeStamp",
        parse: function (msg) {
            //offline time
            let offlineData = {}
            let offlineTime = msg.toString('hex')
            offlineData.raw = msg

            // console.log(offlineTime);
            if (offlineTime != 0) {
                // console.log("ZERO!");
                offlineTime = offlineTime[6] + offlineTime[7] + offlineTime[4] + offlineTime[5] + offlineTime[2] + offlineTime[3] + offlineTime[0] + offlineTime[1]
                offlineTime = parseInt(offlineTime, 16)
                offlineTime = moment.unix(offlineTime).format("YYYY-MM-DD hh:mm:ss A Z");
                offlineTime = new Date(offlineTime)
                // offlineTime = offlineTime.toISOString()
                offlineData.offlineTime = offlineTime
                // console.log(" OFFLINE!!!!!!!!!!");
                // console.log(offlineData);
                offlineData.offlineFlag = true
                offlineData.reportTime = offlineTime

            } else {
                // tag.offlineTime = time
                offlineData.offlineFlag = false
                // console.log(tag.offlineTime);
            }
            return offlineData
        }
    },
    {
        sNo: 33,
        bytes: 2,
        index: 46,
        Name: "LBIDiff",
        parse: function (msg) {
            // console.log(msg);
            lbiDObj = {}
            let dec = converter.hexToDec(msg.toString('hex'))
            lbiDObj.dec = dec
            if (dec > 0) {
                dec = parseFloat(dec)
                dec = parseFloat(dec / 4096 * 3.6)
                // console.log(tag.tagid, dec, msg);
            }
            lbiDObj.hex = msg.toString('hex')
            lbiDObj.int = parseInt(msg.toString('hex'))
            // console.log(converter.hexToDec(msg.toString('hex')));
            // console.log(parseInt(msg.toString('hex')));
            return lbiDObj
        }
    },
    {
        sNo: 34,
        bytes: 32,
        index: 47,
        Name: "CampusName",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 35,
        bytes: 32,
        index: 48,
        Name: "BuildingName",
        parse: function (msg) {

            let building = msg.toString('utf8', 0, 30)
            // console.log(building);
            // console.log(msg.slice(46, 78));

            building.replace(/\s/g, '');
            let match = nonWhiteSpace.exec(building)
            // console.log(match)
            // tag.building = match
            if (building) {
                try {
                    // console.log('here');
                    if (match[1]) {
                        // console.log('here');
                        building = match[1]
                        // console.log(building);
                    }
                } catch (error) {
                    // console.log(error)
                    building = ""
                }
            }
            // console.log(tag.building);
            // console.log(building);
            return building
        }
    },
    {
        sNo: 36,
        bytes: 32,
        index: 49,
        Name: "FloorName",
        parse: function (msg) {
            floor = msg.toString('utf8')
            match = nonWhiteSpace.exec(floor)
            // floor = match
            if (floor) {
                try {

                    if (match[1]) {
                        floor = match[1]
                    };
                } catch (error) {
                    // console.log(error)
                    floor = ""
                }
            }
            // console.log(floor);
            return floor
        }
    },
    {
        sNo: 37,
        bytes: 2,
        index: 50,
        Name: "Profile",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 38,
        bytes: 1,
        index: 58,
        Name: "OperatingMode",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 39,
        bytes: 2,
        index: 52,
        Name: "ZoneID",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 40,
        bytes: 2,
        index: 53,
        Name: "MeasurementRate",
        parse: function (msg) {

            return msg
        }
    },
    {
        sNo: 41,
        bytes: 2,
        index: 54,
        Name: "TemperatureProbe2",
        parse: function (msg) {
            // console.log(msg);
            let tempObj = {}
            let tempHex1 = msg.toString('hex');
            // 3075 = no data
            if (tempHex1 === '3075') {
                // console.log('No Temp');
                tempObj.temp1 = 0
            } else {
                tempHex1 = tempHex1[2] + tempHex1[3] + tempHex1[0] + tempHex1[1]
                let tempInt = parseInt(tempHex1, 16)
                // if (tempInt > 0) {
                //     console.log(tempHex1);
                //     console.log(tempInt);
                //     console.log(tempInt / 100);
                // }
                tempObj.temp1 = tempInt / 100
                if (tempObj.temp1 > 100) {
                    let negTemp = msg.toString('hex')
                    negTemp = negTemp[2] + negTemp[3] + negTemp[0] + negTemp[1]
                    let binary = parseInt(negTemp, 16).toString(2).padStart(8, '0')
                    let goodBinary = ""
                    for (let i = 0; i < binary.length; i++) {
                        let invert
                        if (binary[i] === "0") {
                            invert = "1"
                        } else {
                            invert = "0"
                        }
                        goodBinary = goodBinary + invert
                    }
                    // console.log(tag.EnableHumidity, tag.tagid, goodBinary, parseInt(goodBinary, 2) / -100);
                    tempObj.temp1 = (parseInt(goodBinary, 2) / -100)
                }

                // console.log(msg.slice(110, 112).readUIntLE(0, 2).toString(16));

                // console.log(msg.slice(110, 112))
                // console.log(parseFloat(tempInt / 100))
                return tempObj.temp1
            }
        }

    },
    {
        sNo: 42,
        bytes: 1,
        index: 55,
        Name: "Probe1TempStatus",
        parse: function (msg) {
            // Current status of the probe1 temperature 
            // 0 – Valid Temperature
            // 1 – Undefined - Tag profile not defined
            // 2 – Out of Range if calculated temperature range is not between the minimum and maximum value
            // For G2: -200 to 75
            // For G1: -200 to 75 We can change this range in the ini file Section: PCSERVER
            // MIN_ALLOWED_TEMPERATURE = -200 (Default) MAX_ALLOWED_TEMPERATURE = 75 (Default)
            // 3 – Probe Connection Error if The Temperature ADC is not between the minimum and maximum ADC
            // For G2: 10 to 4085
            // For G1: 5 to 1010 We can change this range in the ini file Section: PCSERVER MIN_ALLOWED_RAW_TEMPERATURE = 5 (Default) MAX_ALLOWED_RAW_TEMPERATURE = 1010
            // 4 – Probe not configured – We will get this status when the tag uses only Probe2 as per its settings.
            // 5 – Beyond Alert Range - if the calculated temperature range is not between the minimum and maximum value of the defined tag profile.
            // We can enable or disable Beyond Alert Range status in ini file

            // Section: PCSERVER ENABLE_BEYOND_ALERT_RANGE=1 (Default value is 0)
            msg = parseInt(msg.toString('hex'))
            return msg
        }
    },
    {
        sNo: 43,
        bytes: 1,
        index: 56,
        Name: "Probe2TempStatus",
        parse: function (msg) {
            msg = parseInt(msg.toString('hex'))
            return msg
        }
    },
    {
        sNo: 44,
        bytes: 1,
        index: 59,
        Name: "DoorAjarStatus",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 45,
        bytes: 2,
        index: 60,
        Name: "LBIValue",
        parse: function (msg) {
            // console.log(msg);
            // console.log(parseInt(msg.toString('hex')));
            let lbiHex = msg.toString('hex');
            lbiHex = lbiHex[2] + lbiHex[3] + lbiHex[0] + lbiHex[1]
            let lbiint = parseInt(lbiHex, 16)
            // console.log(lbiint);
            return lbiint
        }
    },
    {
        sNo: 46,
        bytes: 2,
        index: 61,
        Name: "Res",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 47,
        bytes: 2,
        index: 62,
        Name: "Res",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 48,
        bytes: 1,
        index: 63,
        Name: "EnableHumidity",
        parse: function (msg) {

            let isHumid = parseInt(msg.toString('hex'))
            return isHumid
        }
    },
    {
        sNo: 49,
        bytes: 1,
        index: 64,
        Name: "LocationType",
        parse: function (msg) {
            msg = parseInt(msg.toString('hex'))
            return msg
        }
    },
    {
        sNo: 50,
        bytes: 1,
        index: 80,
        Name: "IsEMTag",
        parse: function (msg) {
            // if (parseInt(msg.toString('hex'))) {

            //     console.log('em', parseInt(msg.toString('hex')));
            // }
            // console.log(msg);
            msg = parseInt(msg.toString('hex'))
            return msg
        }
    },
    {
        sNo: 51,
        bytes: 1,
        index: 81,
        Name: "DoorAjarStatus2",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 52,
        bytes: 1,
        index: 82,
        Name: "EMTagProbe1Profile",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 53,
        bytes: 1,
        index: 83,
        Name: "EMTagProbe2Profile",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 54,
        bytes: 4,
        index: 84,
        Name: "Probe1 Pressure",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 55,
        bytes: 4,
        index: 85,
        Name: "Probe2 Pressure",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 56,
        bytes: 4,
        index: 86,
        Name: "Probe1CO2",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 57,
        bytes: 4,
        index: 87,
        Name: "Probe2CO2",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 57,
        bytes: 1,
        index: 97,
        Name: "iSEMWiFidisplayTag",
        parse: function (msg) {
            // if (parseInt(msg.toString('hex'))) {
            //     console.log('emWifi', parseInt(msg.toString('hex')));
            //     // console.log(message);
            // }
            msg = parseInt(msg.toString('hex'))
            return msg
        }
    }
]
let monitorStreamingObject = [
    {
        sNo: 1,
        bytes: 1,
        index: 0,
        Name: "PaddingByte",
        parse: function (msg) {
            return msg
        }
    }, {
        sNo: 2,
        bytes: 12,
        index: 1,
        Name: "defaultStreamingFields",
        parse: function (msg) {
            let monObj = {}
            let buf = msg.slice(1, 4)
            let buf2 = new Buffer(0x01) //deprecated
            // let buf2 = Buffer.from([0x01]);
            let mont = Buffer.concat([buf, buf2])
            let monitor = mont.readUInt32LE()
            monitor ^= (1 << 23)
            monitor ^= (1 << 22)
            monObj.monitorId = monitor
            let rssi = msg.slice(5, 6).toString('hex')
            // console.log(rssi);
            rssi = parseInt(rssi, 16)
            // console.log(rssi);
            if (rssi >= 128) {
                rssi = (rssi - 256) / 2.0 - 78;
            } else {
                rssi = rssi / 2.0 - 78;
            }
            monObj.rssi = rssi


            // //Buttons,Motion,Rety,LBI
            let buttons = msg.slice(6, 7).toString('hex');
            // console.log(buttons);
            buttons = parseInt(buttons, 16).toString(2).padStart(8, '0');
            // console.log(buttons);
            // console.log(buttons);
            monObj.button1 = parseInt(buttons[0]);
            monObj.button2 = parseInt(buttons[1]);
            monObj.button3 = parseInt(buttons[2]);
            monObj.button4 = parseInt(buttons[3]);
            monObj.inMotion = parseInt(buttons[4]);
            monObj.lbi = parseInt(buttons[0]);
            monObj.triggerStatus = parseInt(buttons[1]);
            switch (buttons[2] + buttons[3]) {
                case "01":
                    monObj.retry = 1
                    break;
                case "10":
                    monObj.retry = 2
                    break;
                case "11":
                    monObj.retry = 3
                    break;
                default:
                    break;
            }

            // monObj.rawMessage = msg.toString('hex');
            monObj.starMac = msg.slice(7, 13).toString('hex')
            // // tag.retry = parseInt(buttons[5] + buttons[6]);
            // dsf.lbi = parseInt(buttons[7]);
            // if (dsf.lbi) {
            //     console.log(buttons, dsf, tag);
            // }
            // console.log(monObj);


            // // console.log(dsf);

            return monObj
        }
    },
    {
        sNo: 3,
        bytes: 3,
        index: 2,
        Name: "Monitor RFID",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 4,
        bytes: 2,
        index: 3,
        Name: "Command",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 5,
        bytes: 1,
        index: 4,
        Name: "Rssi",
        parse: function (msg) {
            //rssi
            let rssi = msg.toString('hex')
            rssi = parseInt(rssi, 16)
            // console.log(rssi);
            if (rssi >= 128) {
                rssi = (rssi - 256) / 2.0 - 78;
            } else {
                rssi = rssi / 2.0 - 78;
            }
            return rssi
        }
    },
    {
        sNo: 6,
        bytes: 1,
        index: 5,
        Name: "Status",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 7,
        bytes: 6,
        index: 6,
        Name: "associatedStarMacId",
        parse: function (msg) {
            return msg

        }
    },
    {
        sNo: 8,
        bytes: 2,
        index: 7,
        Name: "IRID",
        parse: function (msg) {
            let irid = msg.toString('hex');
            irid = irid[2] + irid[3] + irid[0] + irid[1];
            irid = parseInt(irid, 16);
            // console.log(irid);
            return irid
            // return msg
        }
    },
    {
        sNo: 9,
        bytes: 1,
        index: 8,
        Name: "powerLevelType",
        parse: function (msg) {

            // Monitor Types
            // 1. Regular
            // 2. DIM
            // 3. Egress Exciter
            // 4. Monitor 900 MHz
            // 5. VW MM
            // 6. LF DIM
            // 7. LF Exciter
            // 8. Reserved
            // 9. Embedded DIM
            // 2 Bytes     Reserved
            // 3 Bytes     3x Monitor Command value
            // 10. Ecolab DIM
            // 11. GP DIM
            // 12. Monitor MM
            // 13. VW 900 MHz
            // 14. MINI Monitor
            // 15. OFD DIM
            // 16. SDS DIM
            // 17. Repeater

            // console.log(msg);
            // console.log(msg.toString('utf8', 0, 30));

            let buttons = msg.slice(0, 2).toString('hex');
            monitor.type = buttons[0]
            monitor.power = buttons[1]
            buttons = parseInt(buttons, 16).toString(2).padStart(8, '0');
            // if (monitor.monitorId === 529476 || monitor.monitorId === 1349711 || monitor.monitorId === 2535972 || monitor.monitorId === 1350211) {
            //     console.log(monitor.monitorId);
            //     console.log(msg.slice(0, 2).toString('hex'));
            //     console.log(buttons);
            // }

            return msg
        }
    },
    {
        sNo: 10,
        bytes: 2,
        index: 9,
        Name: "strongestStarId",
        parse: function (msg) {
            let star = msg.toString('hex');
            star = star[2] + star[3] + star[0] + star[1];
            star = parseInt(star, 16);
            return star
        }
    },
    {
        sNo: 11,
        bytes: 1,
        index: 10,
        Name: "version",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 12,
        bytes: 2,
        index: 11,
        Name: "associatedStarId",
        parse: function (msg) {
            let star = msg.toString('hex');
            star = star[2] + star[3] + star[0] + star[1];
            star = parseInt(star, 16);
            return star
        }
    },
    {
        sNo: 13,
        bytes: 2,
        index: 12,
        Name: "receivedStarId",
        parse: function (msg) {
            let star = msg.toString('hex');
            star = star[2] + star[3] + star[0] + star[1];
            star = parseInt(star, 16);
            return star
        }
    },
    {
        sNo: 14,
        bytes: 4,
        index: 13,
        Name: "time",
        parse: function (msg) {
            //  Log TimeStamp
            let tobj = {}
            let time = msg.toString('hex')
            tobj.raw = time
            // console.log(time);

            time = time[6] + time[7] + time[4] + time[5] + time[2] + time[3] + time[0] + time[1]
            time = parseInt(time, 16)

            time = moment.unix(time).format("YYYY-MM-DD hh:mm:ss A Z");
            time = new Date(time)
            // time = time.toISOString()
            // tobj.reportedTime = time
            monitor.reportedTime = time
            // tobj.unix = moment(time)

            return time
        }
    },
    {
        sNo: 15,
        bytes: 4,
        index: 14,
        Name: "floorId",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 16,
        bytes: 4,
        index: 15,
        Name: "x",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 17,
        bytes: 4,
        index: 16,
        Name: "y",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 18,
        bytes: 4,
        index: 17,
        Name: "z",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 19,
        bytes: 4,
        index: 22,
        Name: "vendorId",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 20,
        bytes: 6,
        index: 23,
        Name: "macId",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 21,
        bytes: 4,
        index: 24,
        Name: "objectId",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 22,
        bytes: 4,
        index: 25,
        Name: "confidenceFactor",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 23,
        bytes: 4,
        index: 27,
        Name: "controllerIP",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 24,
        bytes: 4,
        index: 29,
        Name: "changedOn",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 25,
        bytes: 2,
        index: 34,
        Name: "moduleVersion",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 26,
        bytes: 32,
        index: 37,
        Name: "campusName",
        parse: function (msg) {
            return msg
        }
    },
    {
        sNo: 27,
        bytes: 32,
        index: 38,
        Name: "buildingName",
        parse: function (msg) {
            let building = msg.toString('utf8', 0, 30)
            // console.log(building);
            // console.log(msg.slice(46, 78));

            building.replace(/\s/g, '');
            let match = nonWhiteSpace.exec(building)
            // console.log(match)
            // tag.building = match
            if (building) {
                try {
                    // console.log('here');
                    if (match[1]) {
                        // console.log('here');
                        building = match[1]
                        // console.log(building);
                    }
                } catch (error) {
                    // console.log(error)
                    building = ""
                }
            }
            // console.log(tag.building);
            // console.log(building);
            return building
        }
    },
    {
        sNo: 28,
        bytes: 32,
        index: 39,
        Name: "floorName",
        parse: function (msg) {
            floor = msg.toString('utf8')
            match = nonWhiteSpace.exec(floor)
            // floor = match
            if (floor) {
                try {

                    if (match[1]) {
                        floor = match[1]
                    };
                } catch (error) {
                    // console.log(error)
                    floor = ""
                }
            }
            // console.log(floor);
            return floor
        }
    },
    {
        sNo: 29,
        bytes: 2,
        index: 40,
        Name: "profile",
        parse: function (msg) {
            // console.log(msg.toString('utf8', 0, 30));
            // msg = msg.toString('hex')
            // console.log(msg);
            return msg
        }
    },
    {
        sNo: 30,
        bytes: 50,
        index: 41,
        Name: "name",
        parse: function (msg) {
            monitorName = msg.toString('utf8')
            match = nonWhiteSpace.exec(monitorName)
            // floor = match
            if (monitorName) {
                try {

                    if (match[1]) {
                        monitorName = match[1]
                    };
                } catch (error) {
                    // console.log(error)
                    monitorName = ""
                }
            }
            // console.log(monitorName);
            return monitorName
        }
    },
    {
        sNo: 31,
        bytes: 2,
        index: 42,
        Name: "LBIValue",
        parse: function (msg) {
            let lbiHex = msg.toString('hex');
            lbiHex = lbiHex[2] + lbiHex[3] + lbiHex[0] + lbiHex[1]
            let lbiint = parseInt(lbiHex, 16)
            // console.log(lbiint);
            return lbiint
        }
    },
    {
        sNo: 32,
        bytes: 1,
        index: 43,
        Name: "keys",
        parse: function (msg) {
            return msg
        }
    }
]

let tagStreamingBuild = []
let monitorStreamingBuild = [];

function tagParsingHelper() {
    let startByte = 0
    tagStreamingFields.forEach(stream => {
        // console.log(stream);

        tagStreamingObject.forEach(obj => {
            if (stream === obj.index) {
                if (startByte === 0) {
                    obj.startingByte = startByte
                } else {
                    obj.startingByte = startByte + 1
                }
                tagStreamingBuild.push(obj)
                startByte = startByte + obj.bytes
            }
        });
    });
    // console.log(startByte);
}
tagParsingHelper()
function monitorParsingHelper() {
    let startByte = 0
    monitorStreamingFields.forEach(stream => {
        // console.log(stream);

        monitorStreamingObject.forEach(obj => {
            if (stream === obj.index) {
                if (startByte === 0) {
                    obj.startingByte = startByte
                } else {
                    obj.startingByte = startByte + 1
                }
                monitorStreamingBuild.push(obj)
                startByte = startByte + obj.bytes
            }
        });
    });
    // console.log(startByte);
}
monitorParsingHelper()