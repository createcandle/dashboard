"""Dashboard API handler."""


import functools
import json
import os
import re
import sys
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
#from os import listdir
#from os.path import isfile, join
import time
#from time import sleep, time
import random
import string
#import datetime
from datetime import datetime,timedelta
#from dateutil import tz
#from dateutil.parser import *

# Timezones
#try:
#    from pytz import timezone
#    import pytz
#except:
#    print("ERROR, pytz is not installed. try 'pip3 install pytz'")


import subprocess
#import threading
import requests

try:
    from gateway_addon import APIHandler, APIResponse
    #print("succesfully loaded APIHandler and APIResponse from gateway_addon")
except:
    print("Import APIHandler and APIResponse from gateway_addon failed. Use at least WebThings Gateway version 0.10")

try:
    from gateway_addon import Adapter, Device, Database
except:
    print("Gateway addon not loaded?!")

print = functools.partial(print, flush=True)






_TIMEOUT = 3

_CONFIG_PATHS = [
    os.path.join(os.path.expanduser('~'), '.webthings', 'config'),
]

if 'WEBTHINGS_HOME' in os.environ:
    _CONFIG_PATHS.insert(0, os.path.join(os.environ['WEBTHINGS_HOME'], 'config'))




class DashboardAPIHandler(APIHandler):
    """Power settings API handler."""

    def __init__(self, verbose=False):
        """Initialize the object."""
        #print("INSIDE API HANDLER INIT")
        
        
        self.ready = False
        self.running = True
        self.addon_name = 'dashboard'
        self.server = 'http://127.0.0.1:8080'
        self.DEV = False
        self.DEBUG = False
            
        self.things = [] # Holds all the things, updated via the API. Used to display a nicer thing name instead of the technical internal ID.
        
        self.interval = 30
        self.screensaver_delay = 60
        self.fit_to_screen = "mix"
        self.show_clock = False
        self.show_date = False
        self.show_weather = False
        
        self.show_voco_timers = True
        self.voco_persistent_data = {}
        self.time_zone = str(time.tzname[0])
        self.seconds_offset_from_utc = -time.timezone

        self.animations = True
        self.start_with_dashboard = False

            
        self.weather_addon_exists = False
        
        
        self.icons_data = {}
        
        self.log_day_averages = {}
        
            
        try:
            manifest_fname = os.path.join(
                os.path.dirname(__file__),
                '..',
                'manifest.json'
            )

            with open(manifest_fname, 'rt') as f:
                try:
                    manifest = json.load(f)
                except Exception as ex:
                    print("Error loading manifest.json: " + str(ex))
            
            #print("manifest['id']: " + str(manifest['id']))
            APIHandler.__init__(self, manifest['id'])
            self.manager_proxy.add_api_handler(self)
            

            # LOAD CONFIG
            try:
                self.add_from_config()
            except Exception as ex:
                print("Error loading config: " + str(ex))
            
            if self.DEBUG:
                print("self.manager_proxy = " + str(self.manager_proxy))
                print("Created new API HANDLER: " + str(manifest['id']))
        except Exception as e:
            print("Failed to init UX extension API handler: " + str(e))
        
        try:
            
            self.addon_path = os.path.join(self.user_profile['addonsDir'], self.addon_name)
            self.icons_path = os.path.join(self.addon_path, 'icons')
            self.logs_db_path = os.path.join(self.user_profile['logDir'], 'logs.sqlite3')
            
            self.data_dir_path = os.path.join(self.user_profile['dataDir'], self.addon_name)
            self.persistence_file_path = os.path.join(self.data_dir_path, 'persistence.json')
            
            self.log_day_averages_file_path = os.path.join(self.data_dir_path, 'logging_day_averages.json')
            
            #self.external_picture_drop_dir = os.path.join(self.user_profile['dataDir'], 'privacy-manager', 'printme')
            
            self.sqlite_binary_path = run_command('which sqlite3')
            self.sqlite_binary_path = self.sqlite_binary_path.rstrip()
            
            # weather
            self.weather_addon_path =  os.path.join(self.user_profile['addonsDir'], 'weather-adapter')
            if os.path.isdir(self.weather_addon_path):
                self.weather_addon_exists = True
            
            # Voco
            self.voco_persistent_data = {}
            self.voco_persistence_file_path =  os.path.join(self.user_profile['dataDir'], 'voco','persistence.json')
            if not os.path.isfile(self.voco_persistence_file_path):
                if self.DEBUG:
                    print("Voco is not installed, no need to check voco timers")
                self.show_voco_timers = False
            
            
        except Exception as ex:
            print("Failed to make paths: " + str(ex))
            
        # Get persistent data
        self.persistent_data = {}
        try:
            if os.path.isfile(self.persistence_file_path):
                with open(self.persistence_file_path) as f:
                    self.persistent_data = json.load(f)
                    if self.DEBUG:
                        print('self.persistent_data loaded from file.')  #' length: ' + len(str(self.persistent_data)))
                
        except Exception as ex:
            if self.DEBUG:
                print("Could not load persistent data from JSON file: " + str(ex))
            self.persistent_data = {}
            
        if not 'dashboards' in self.persistent_data:
            self.persistent_data['dashboards'] = {}
            
        if not 'logging_meta' in self.persistent_data:
            self.persistent_data['logging_meta'] = {}
            
        
        
        self.log_day_averages = {}
        try:
            if os.path.isfile(self.log_day_averages_file_path):
                with open(self.log_day_averages_file_path) as ldaf:
                    self.log_day_averages = json.load(ldaf)
        except Exception as ex:
            if self.DEBUG:
                print("Could not load log_day_averages data from JSON file: " + str(ex))
            self.log_day_averages = {}
                
            
        self.scan_icons()
        
            
        # Respond to gateway version
        try:
            if self.DEBUG:
                print("Gateway version: " + self.gateway_version)
        except:
            if self.DEBUG:
                print("self.gateway_version did not exist")
        
        
        
        
        self.ready = True
        
        self.should_save_persistent_data = False
        
        self.old_data = {}
        
        if self.DEBUG:
            self.average_all_log_data()
        
        while self.running:
            if int(time.time()) % (60 * 60 * 24) == 1:  # a day has passed
                if self.DEBUG:
                    print("a brand new day - time to average all log data into dayly values")
                    
                self.average_all_log_data()
                self.really_delete_deleted_log_files()
                
            time.sleep(1)
            
            if self.should_save_persistent_data == True:
                self.should_save_persistent_data = False
                self.save_persistent_data()
                
        



    # Read the settings from the add-on settings page
    def add_from_config(self):
        """Attempt to add all configured devices."""
        try:
            database = Database(self.addon_name)
            if not database.open():
                print("Could not open settings database")
                return
            
            config = database.load_config()
            database.close()
            
        except:
            print("Error! Failed to open settings database.")
            self.close_proxy()
        
        if not config:
            print("Error loading config from database")
            return
        
        if self.DEV:
            print(str(config))

        if 'Debugging' in config:
            self.DEBUG = bool(config['Debugging'])
            if self.DEBUG:
                print("-Debugging preference was in config: " + str(self.DEBUG))
                
        if 'Debug' in config:
            self.DEBUG = bool(config['Debug'])
            if self.DEBUG:
                print("-Debug preference was in config: " + str(self.DEBUG))

        
        if "Start with Dashboard" in config:
            self.start_with_dashboard = bool(config["Start with Dashboard"]) # can be "cover", "contain" or "mix"
            if self.DEBUG:
                print("Start with Dashboard preference was in config: " + str(self.start_with_dashboard))
                
        if "Hide animations" in config:
            self.animations = not bool(config["Hide animations"]) # can be "cover", "contain" or "mix"
            if self.DEBUG:
                print("Animations preference was in config: " + str(self.animations))

    
    
    
    def average_all_log_data(self):
        
        boolean_command_to_run = self.sqlite_binary_path + " " + str(self.logs_db_path) + " 'SELECT * FROM metricsBoolean';"
        #print("get_log_data: SQLITE boolean_command to run: ", boolean_command_to_run)
        raw_boolean_log_data = run_command(boolean_command_to_run)
        
        #print("raw_boolean_log_data: ", raw_boolean_log_data)
        
        if 'database is locked' in raw_boolean_log_data:
            time.sleep(2)
            raw_boolean_log_data = run_command(boolean_command_to_run)
            
        time.sleep(1)
        
        numeric_command_to_run = self.sqlite_binary_path + " " + str(self.logs_db_path) + " 'SELECT * FROM metricsNumber';"
        #print("get_log_data: SQLITE numeric_command to run: ", numeric_command_to_run)
        raw_numeric_log_data = run_command(numeric_command_to_run)
    
        #print("raw_numeric_log_data: ", raw_numeric_log_data)
        
        if 'database is locked' in raw_numeric_log_data:
            time.sleep(2)
            raw_numeric_log_data = run_command(numeric_command_to_run)
        
        if 'database is locked' in raw_boolean_log_data:
            raw_boolean_log_data = ''
            
        if 'database is locked' in raw_numeric_log_data:
            raw_numeric_log_data = ''
        
        #query_string = "SELECT * FROM metricsBoolean WHERE id IN (" + str(log_ids_string) + ") AND date > " + str(epoch_time) + ";"
        #raw_numeric_log_data = subprocess.check_output([str(sqlite_binary_path), str(self.logs_db_path), query_string])
    
    
        #print("raw_numeric_log_data: ", raw_numeric_log_data)
        
        if raw_numeric_log_data != '':  # better to return something if possible, so at least part of the logs show up
            self.average_log_data(raw_numeric_log_data,'numeric')
            
        if raw_boolean_log_data != '':
            self.average_log_data(raw_boolean_log_data,'boolean')
        
        
    def average_log_data(self, raw_log_data='', log_type='numeric'):
        print("in average_log_data. log_type: ", log_type);
        
        sorted_points = {}
        for line in split_lines_generator(raw_log_data):
            #print("line: ", line)
            if "|" in line:
                line_parts = line.split("|")
                log_id = line_parts[0]
                if not log_id in sorted_points:
                    print("\n\nfiltering out log_id: ", log_id)
                    sorted_points[log_id] = []
                    #oldest = int(time.time()) * 1000
                    #newest = 0
                    start_of_days = []
                    daily_averages = {}
                    for log_line in split_lines_generator(raw_log_data):
                        log_line_parts = log_line.split("|")
                        if len(log_line_parts) == 3 and log_line_parts[0] == log_id:
                            #print("v: ", line_parts[2])
                            
                            if is_number(log_line_parts[2]):
                                
                                log_v = None
                                if "." in log_line_parts[2]:
                                    log_v = float(log_line_parts[2])
                                else:
                                    log_v = int(log_line_parts[2])
                                #print("log_v: ", log_v)
                                
                                if log_v != None:
                                    log_d = int(log_line_parts[1]);
                                    #if log_d < oldest:
                                    #    oldest = log_d
                                    #if log_d > newest:
                                    #    newest = log_d
                                    
                                    #print("log_d: ", log_d)
                                    
                                    day_start_timestamp = log_d - (log_d % 86400000)
                                    if not str(day_start_timestamp) in daily_averages:
                                        start_of_days.append(day_start_timestamp)
                                        daily_averages[str(day_start_timestamp)] = {'day_start_timestamp':day_start_timestamp, 'day_end_timestamp':day_start_timestamp + 86399999, 'before_start':None, 'after_end':None, 'points':[]}
                                    daily_averages[str(day_start_timestamp)]['points'].append({"d":log_d,"v":log_v})
                            #else:
                            #    print("log_v was not numeric: " + str(log_line_parts[2]))
                    
                    
                    #print(json.dumps(daily_averages,indent=2))
                    #print("oldest, newest: ", oldest, newest)
                    
                    start_of_days.sort()
                    
                    for index, start_of_day in enumerate(start_of_days):
                        day_average = None
                        before_start_point = None
                        after_end_point = None
                        
                        millis_accounted_for = 0
                        
                        total_score = 0
                        
                        if index > 0:
                            if start_of_days[index - 1] > start_of_day - 86500000:
                                # get the last datapoint from the previous day
                                last_point_yesterday = daily_averages[str(start_of_days[index - 1])]['points'][ len(daily_averages[str(start_of_days[index - 1])]['points']) - 1 ]
                                first_point_today = daily_averages[str(start_of_day)]['points'][0]
                                
                                millis_inside_this_day = first_point_today['d'] - start_of_day
                                #millis_accounted_for = millis_accounted_for + millis_inside_this_day
                                #millis_outside_this_day = start_of_day - last_point_yesterday[d]
                                #inside_value = abs(first_point_today['v'])
                                #outside_value = abs(before_start_point['v'])
                                
                                ratio_inside_this_day = millis_inside_this_day / (first_point_today['d'] - last_point_yesterday['d'])
                                value_delta_inside_this_day = abs(first_point_today['v'] - last_point_yesterday['v']) * ratio_inside_this_day
                                
                                interpolated_value = None
                                if first_point_today['v'] > last_point_yesterday['v']:
                                    interpolated_value = first_point_today['v'] - value_delta_inside_this_day
                                else:
                                    interpolated_value = first_point_today['v'] + value_delta_inside_this_day
                                #print("interpolated_value at start of day: ", interpolated_value)
                                    
                                daily_averages[str(start_of_day)]['points'].insert(0,{'d':start_of_day,'v':interpolated_value})
                                
                            
                        if index < len(start_of_days) - 1:
                            next_day_start = start_of_days[index + 1]
                        
                            if next_day_start < start_of_day + 86500000:
                                end_of_day = start_of_day + 86399999
                                
                                # get the first datapoint from the next day
                                first_point_tomorrow = daily_averages[str(next_day_start)]['points'][0]
                                
                                last_point_today = daily_averages[str(start_of_day)]['points'][ len(daily_averages[str(start_of_day)]['points']) - 1 ]
                                
                                millis_inside_this_day = end_of_day - last_point_today['d']
                                #millis_accounted_for = millis_accounted_for + millis_inside_this_day
                                #millis_outside_this_day = start_of_day - last_point_yesterday[d]
                                #inside_value = abs(first_point_today['v'])
                                #outside_value = abs(before_start_point['v'])
                                
                                ratio_inside_this_day = millis_inside_this_day / (last_point_today['d'] - first_point_tomorrow['d'])
                                value_delta_inside_this_day = abs(last_point_today['v'] -  first_point_tomorrow['v']) * ratio_inside_this_day
                                
                                interpolated_value = None
                                if last_point_today['v'] > first_point_tomorrow['v']:
                                    interpolated_value = last_point_today['v'] - value_delta_inside_this_day
                                else:
                                    interpolated_value = last_point_today['v'] + value_delta_inside_this_day
                                    
                                #print("interpolated_value at end of day: ", interpolated_value)
                                daily_averages[str(start_of_day)]['points'].append({'d':end_of_day,'v':interpolated_value})
                                
                                
                        
                        point_count_today = len(daily_averages[str(start_of_day)]['points'])
                        #print("point_count_today: " + str(point_count_today))
                        
                        for point_index, current_point in enumerate( daily_averages[str(start_of_day)]['points']):
                           # print("point_index: ", point_index)
                            if point_index < point_count_today - 1:
                                
                                point = daily_averages[str(start_of_day)]['points'][point_index]
                                next_point = daily_averages[str(start_of_day)]['points'][point_index + 1]
                                
                                #print("point: " + str(point))
                                #print("next_point: " + str(next_point))
                                
                                millis_in_between = abs(next_point['d'] - point['d'])
                                #print("millis_in_between: ", millis_in_between)
                                millis_accounted_for = millis_accounted_for + millis_in_between
                                total_score = total_score + (((point['v'] + next_point['v']) / 2) * millis_in_between)
                            
                            #scores_total = scores_total + (((interpolated_value + last_point_today['v']) / 2) * millis_inside_this_day)
                        
                        if millis_accounted_for != 0:
                            day_average = total_score / millis_accounted_for
                            if self.DEBUG:
                                print("day_average: " + str(day_average) + ",  hours_accounted_for: ", millis_accounted_for / 3600000)
                        
                        
                            if day_average != None:
                                sorted_points[log_id].append({"d":start_of_day, "v":day_average})
                                #sorted_points[log_id][str(start_of_day)] = day_average
                        
                        
                        
        #self.log_day_averages = sorted_points                
        print("\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nLOG DAY AVERAGES: ")
        print(json.dumps(self.log_day_averages,indent=2))
        
        
        for log_id in sorted_points:
            if not log_id in self.log_day_averages:
                self.log_day_averages[log_id] = sorted_points[log_id]
                #self.log_day_averages[log_id].append(sorted_points[log_id][0]) # TODO: test point
                #print("\n\nadded test point for log_id: ", log_id)
            else:    
                for day in sorted_points[log_id]:
                    #print("updating. day: ", day)
                    already_exists = False
                    for known_day_index, known_day in enumerate(self.log_day_averages[log_id]):
                        #print("known_day_index, known_day: ", known_day_index, known_day)
                        if known_day['d'] == day['d']:
                            already_exists = True
                            break
                        
                    if already_exists == False:
                        print("point did not exist in self.log_day_averages yet, adding it now: ", day)
                        self.log_day_averages[log_id].append(day)
                
        
        
        try:
            with open(self.log_day_averages_file_path, 'w') as ldf:
                if self.DEBUG:
                    print("saving log_day_averages to JSON file")
                json.dump( self.log_day_averages, ldf, indent=4 )
                
        except Exception as ex:
            if self.DEBUG:
                print("Error: could not save log_day_averages data to file: " + str(ex) )
        
        
                
        
        
    def scan_icons(self):
        if self.DEBUG:
            print("scanning icons dir: ", self.icons_path)
        def walkfn(dirname=None, json_data=None):
            if not json_data:
                json_data = dict()
            for name in os.listdir(dirname):
                path = os.path.join(dirname, name)
                if os.path.isdir(path):
                    json_data[name] = dict()
                    json_data[name] = walkfn(path, json_data=json_data[name])
                elif os.path.isfile(path):
                    if path.endswith('.svg'):
                        json_data.update({name: None})
            return json_data


        self.icons_data = walkfn(dirname=self.icons_path)
        


    def handle_request(self, request):
        """
        Handle a new API request for this handler.

        request -- APIRequest object
        """
        
        try:
        
            if request.method != 'POST':
                if self.DEBUG:
                    print("not post")
                return APIResponse(status=404)
            
            if request.path == '/ajax' or request.path == '/poll' or request.path == '/get_time':

                try:
                    
                    if request.path == '/ajax':
                        if self.DEBUG:
                            print("received ajax request")
                    
                        if 'action' in request.body:
                            
                            action = str(request.body['action'])
                            if self.DEBUG:
                                print("received ajax request for action: " + action)
                            
                            if action == 'init':
                                
                                self.logging_files = os.listdir(self.data_dir_path)
                                
                                state = True
                                
                                return APIResponse(
                                  status=200,
                                  content_type='application/json',
                                  content=json.dumps({'state': state, 
                                                      'dashboards': self.persistent_data['dashboards'],
                                                      'logging_meta': self.persistent_data['logging_meta'],
                                                      'logging_files': self.logging_files,
                                                      'icons': self.icons_data,
                                                      'animations': self.animations,
                                                      'show_voco_timers': self.show_voco_timers,
                                                      'start_with_background':self.start_with_dashboard,
                                                      'debug': self.DEBUG
                                                    }),
                                )
                             
                            elif action == 'load_dashboards':
                                state = True
                                
                                return APIResponse(
                                  status=200,
                                  content_type='application/json',
                                  content=json.dumps({'state': state,
                                                      'dashboards': self.persistent_data['dashboards'],
                                                    }),
                                )
                             
                             
                            elif action == 'load_logging_meta':
                                state = True
                                
                                self.logging_files = os.listdir(self.data_dir_path)
                                
                                return APIResponse(
                                  status=200,
                                  content_type='application/json',
                                  content=json.dumps({'state': state,
                                                      'logging_meta': self.persistent_data['logging_meta'],
                                                      'logging_files': self.logging_files,
                                                      'log_day_averages': self.log_day_averages
                                                    }),
                                )
                            
                               
                            #   
                            # SAVE
                            #
                            elif action == 'save':
                                
                                state = False
                                if 'dashboards' in request.body:
                                    self.persistent_data['dashboards'] = request.body['dashboards']
                                    state = True
                                
                                if 'thing_id' in request.body and 'logging_meta' in request.body:
                                    thing_id = str(request.body['thing_id'])
                                    logging_meta = request.body['logging_meta'];
                                    
                                    if 'property_id' in request.body:
                                        property_id = str(request.body['property_id'])
                                        if len(thing_id) and not self.persistent_data['logging_meta'][thing_id]:
                                            self.persistent_data['logging_meta'][thing_id] = {"properties":{}}
                                            
                                        if not 'properties' in logging_meta and len(property_id):
                                        
                                            if self.DEBUG:
                                                print("updating a property in logging_meta:  " + thing_id + " -> " + property_id)
                                            
                                            self.persistent_data['logging_meta'][thing_id]['properties'][property_id] = logging_meta
                                                
                                            state = True
                                            
                                        else:
                                            if self.DEBUG:
                                                print("error, the logging_meta data for a property had 'properties' in it, so seems to be thing data, not property data?: ", json.dumps(logging_meta))
                                            
                                    elif 'properties' in logging_meta:
                                        if self.DEBUG:
                                            print("saving data for an entire thing to logging_meta.  thing_id: " + thing_id)
                                        #print("request: save: thing_id, logging_meta: ", thing_id, json.dumps(request.body['logging_meta']))
                                        self.persistent_data['logging_meta'][thing_id] = logging_meta
                                        state = True
                                    
                                    else:
                                        if self.DEBUG:
                                            print("error, the logging_meta data for a thing did not have 'properties' in it. Perhaps it's data for a property?: ", json.dumps(logging_meta))
                                
                                if state == True:
                                    self.should_save_persistent_data = True
                                
                                
                                return APIResponse(
                                  status=200,
                                  content_type='application/json',
                                  content=json.dumps({
                                                'state' : state
                                            }),
                                )
                                
                                
                            
                            #   
                            # GET LOGS DATA
                            #
                            elif action == 'get_logs_data':
                                #print("GETTING LOG DATA")
                                
                                #print("self.user_profile: ", self.user_profile)
                                
                                state = False
                                raw_boolean_log_data = ''
                                raw_numeric_log_data = ''
                                
                                self.logging_files = os.listdir(self.data_dir_path)
                                
                                if 'log_ids' in request.body:
                                    try:
                                        log_ids = request.body['log_ids'];
                                        if self.DEBUG:
                                            print("get_logs_data: log_ids: ", log_ids)
                                        
                                        
                                        if len(log_ids) and os.path.exists(self.logs_db_path):
                                            
                                            log_ids_string = ''
                                            for idx, log_id in enumerate(log_ids):
                                                log_ids_string = log_ids_string + log_id
                                                if idx < len(log_ids) - 1:
                                                    log_ids_string = log_ids_string + ', '
                                            
                                            epoch_time = int(time.time()) - (3600 * 50)
                                            epoch_time = epoch_time * 1000
                                            
                                            if 'from_timestamp' in request.body:
                                                from_timestamp = int(request.body['from_timestamp'])
                                                if from_timestamp >= 0: #1764400000:
                                                    epoch_time = from_timestamp
                                                    
                                                
                                            if self.DEBUG:
                                                print("get_logs_data: getting date newer than: " + str(epoch_time))
                                            
                                            
                                            #print("get_log_data: log_ids: ", log_ids);
                                            #print("get_log_data: 24 hours ago milliseconds timestamp: ", epoch_time);
                                            
                                            # WHERE ID IN (2, 3, 4, 7, 11, 34)
                                            # sqlite3 ~/.webthings/log/logs.sqlite3 'SELECT * FROM metricsNumber WHERE id == 13 AND date > 1762049555000';
                                            
                                            
                                            #print("SQLITE binary path: ", sqlite_binary_path)
                                            
                                            boolean_command_to_run = self.sqlite_binary_path + " " + str(self.logs_db_path) + " 'SELECT * FROM metricsBoolean WHERE id IN (" + str(log_ids_string) + ") AND date > " + str(epoch_time) + "';"
                                            #print("get_log_data: SQLITE boolean_command to run: ", boolean_command_to_run)
                                            raw_boolean_log_data = run_command(boolean_command_to_run)
                                            
                                            #print("raw_boolean_log_data: ", raw_boolean_log_data)
                                            
                                            if 'database is locked' in raw_boolean_log_data:
                                                time.sleep(2)
                                                raw_boolean_log_data = run_command(boolean_command_to_run)
                                                
                                            
                                            numeric_command_to_run = self.sqlite_binary_path + " " + str(self.logs_db_path) + " 'SELECT * FROM metricsNumber WHERE id IN (" + str(log_ids_string) + ") AND date > " + str(epoch_time) + "';"
                                            #print("get_log_data: SQLITE numeric_command to run: ", numeric_command_to_run)
                                            raw_numeric_log_data = run_command(numeric_command_to_run)
                                        
                                            #print("raw_numeric_log_data: ", raw_numeric_log_data)
                                            
                                            if 'database is locked' in raw_numeric_log_data:
                                                time.sleep(2)
                                                raw_numeric_log_data = run_command(numeric_command_to_run)
                                            
                                            if 'database is locked' in raw_boolean_log_data:
                                                raw_boolean_log_data = ''
                                                
                                            if 'database is locked' in raw_numeric_log_data:
                                                raw_numeric_log_data = ''
                                            
                                            #query_string = "SELECT * FROM metricsBoolean WHERE id IN (" + str(log_ids_string) + ") AND date > " + str(epoch_time) + ";"
                                            #raw_numeric_log_data = subprocess.check_output([str(sqlite_binary_path), str(self.logs_db_path), query_string])
                                        
                                        
                                            #print("raw_numeric_log_data: ", raw_numeric_log_data)
                                            
                                            if raw_numeric_log_data != '' or raw_boolean_log_data != '': # better to return something if possible, so at least part of the logs show up
                                                state = True
                                        
                                    except Exception as ex:
                                        if self.DEBUG:
                                            print("caught error getting log data from sqlite: ", ex);

                                   
                                
                                
                                return APIResponse(
                                  status=200,
                                  content_type='application/json',
                                  content=json.dumps({
                                                'state': state,
                                                'raw_boolean_log_data': raw_boolean_log_data,
                                                'raw_numeric_log_data': raw_numeric_log_data,
                                                'logging_files': self.logging_files,
                                                'log_day_averages': self.log_day_averages
                                            }),
                                )
                                
                                
                            
                            #
                            #  LOAD, SAVE OR DELETE OLD AVERAGED LOGS DATA JSON FILE
                            #
                            
                            elif action == 'save_logs_data' or action == 'load_logs_data' or action == 'delete_logs_data':
                                state = False
                                log_data = None
                                if 'thing_id' in request.body and property_id in request.body:
                                    thing_id = str(request.body['thing_id'])
                                    property_id = str(request.body['property_id'])
                                    
                                    if len(thing_id) and len(property_id):
                                        file_path = thing_id + "--x--" + property_id + ".json"
                                        if self.DEBUG:
                                            print("save_logs_data to file: " + str(file_path))
                                        log_file_path = os.path.join(self.user_profile['dataDir'], self.addon_name, file_path)
                                        
                                        try:
                                            if action == 'save_logs_data':
                                                if 'logging_data' in request.body:
                                                    logging_data = request.body['logging_data'];
                                                    logging_data_json = json.dumps(logging_data, indent=4)
                                                    with open(log_file_path, 'w') as f:
                                                        f.write(logging_data_json)
                                                        #json.dump( logging_data, f, indent=2 )
                                                        state = True
                                                        if self.DEBUG:
                                                            print("log data saved to json file")
                                                else:
                                                    if self.DEBUG:
                                                        print("error: save_logs_data: no actual log data provided")
                                            
                                            elif action == 'load_logs_data' and os.path.isfile(log_file_path):
                                                with open(log_file_path, 'r') as f:
                                                    log_data = json.load(r)
                                                    state = True
                                                    if self.DEBUG:
                                                        print("loaded log data from json file")
                                                    
                                                    
                                            elif action == 'delete_logs_data' and os.path.isfile(log_file_path):
                                                os.rename(log_file_path, log_file_path + '_bak')
                                                if not 'logging_files_to_delete' in self.persistent_data:
                                                    self.persistent_data['logging_files_to_delete'] = {}
                                                    
                                                self.persistent_data['logging_files_to_delete'][log_file_path + '_bak'] = time.time() + (60 * 60 * 24 * 7)
                                                
                                                if not self.persistent_data['logging_meta'][thing_id]:
                                                    self.persistent_data['logging_meta'][thing_id] = {"properties":{}}
                                                if not self.persistent_data['logging_meta'][thing_id]['properties'][property_id]:
                                                    self.persistent_data['logging_meta'][thing_id]['properties'][property_id] = {}
                                                
                                                del self.persistent_data['logging_meta'][thing_id]['properties'][property_id]
                                                if len(self.persistent_data['logging_meta'][thing_id]['properties'].keys()) == 0:
                                                    del self.persistent_data['logging_meta'][thing_id]
                                                    
                                                self.should_save_persistent_data = True
                                                state = True
                                                if self.DEBUG:
                                                    print("marked log data file for deletion in one week: " + log_file_path + '_bak')
                                                        
                                            else:
                                                if self.DEBUG:
                                                    print("action failed for ", action, thing_id, property_id)

                                        except Exception as ex:
                                            if self.DEBUG:
                                                print("Error: caught error while performing logging action:  " + str(action) + ": "+ str(ex) )
                                            
                                        
                                        
                                return APIResponse(
                                  status=200,
                                  content_type='application/json',
                                  content=json.dumps({
                                                'state': state,
                                                'log_data': log_data
                                            }),
                                )
                                        
                                
                            else:
                                if self.DEBUG:
                                    print("unsupported action: " + str(action))
                                return APIResponse(status=500)
                                
                            
                            
                        else:
                            if self.DEBUG:
                                print("received ajax request, but no action")
                            return APIResponse(status=500)
                    
                    
                    
                            
                            
                    elif request.path == '/poll':
                        if self.DEBUG:
                            print("request at /poll")
                        state = False
                        # Get the list of Voco timers
                        try:
                            if self.show_voco_timers:
                                
                                try:
                                    with open(self.voco_persistence_file_path) as f:
                                        self.voco_persistent_data = json.load(f)
                                        #if self.DEBUG:
                                        #    print('self.voco_persistence_file_path loaded from file: ' + str(self.voco_persistent_data))
                                        if 'action_times' in self.voco_persistent_data['action_times']:
                                            action_count = len( self.voco_persistent_data['action_times'] )
                                            state = True
                                            
                
                                except Exception as ex:
                                    if self.DEBUG:
                                        print("Error, could not load Voco persistent data file: " + str(ex))
                                
                            return APIResponse(
                              status=200,
                              content_type='application/json',
                              content=json.dumps({'state' : state,
                                                  'show_voco_timers':self.show_voco_timers,
                                                  'action_times':self.voco_persistent_data['action_times'],
                                                  'timezone':self.time_zone,
                                                  'seconds_offset_from_utc':self.seconds_offset_from_utc
                                                }),
                            )
                        except Exception as ex:
                            print("Error getting poll data: " + str(ex))
                            return APIResponse(
                              status=500,
                              content_type='application/json',
                              content=json.dumps("Error while getting thing data: " + str(ex)),
                            )
                            
                            
                            
                    
                            
                   

                    
                    elif request.path == '/get_time':
                        if self.DEBUG:
                            print("in /get_time")
                        try:
                            # Fri 19 Aug 19:44:29 CEST 2022
                            system_date = run_command('date')
                            system_date = system_date.replace('  ', ' ')
                            system_date = system_date.replace('  ', ' ')
                            system_date = system_date.replace('  ', ' ')
                            system_date = system_date.split(' ')
                            
                            #print("system_date: " + str(system_date))
                            #print("len(system_date): " + str(len(system_date)))
                            system_time = system_date[3]
                            #print("system_time: " + str(system_time))
                            #print("len(system_time): " + str(len(system_time)))
                            #if self.DEBUG:
                            #    print("system_time from system_date: " + str(system_time))
                            time_parts = system_time.split(':')
                            
                            return APIResponse(
                              status=200,
                              content_type='application/json',
                              content=json.dumps({'state' : 'ok', 
                                                  'day_name':system_date[0], 
                                                  'date':system_date[2], 
                                                  'month':system_date[1], 
                                                  'hours':time_parts[0], 
                                                  'minutes':time_parts[1],
                                                  'timezone':self.time_zone,
                                                  'seconds_offset_from_utc':-time.timezone
                                              }),
                            )
                        except Exception as ex:
                            if self.DEBUG:
                                print("Error returning system time: " + str(ex))
                            return APIResponse(
                              status=500,
                              content_type='application/json',
                              content=json.dumps("Error while returning system time: " + str(ex)),
                            )
                    
                    else:
                        return APIResponse(
                          status=500,
                          content_type='application/json',
                          content=json.dumps("API error"),
                        )
                        
                except Exception as ex:
                    if self.DEBUG:
                        print("general API error: " + str(ex))
                    return APIResponse(
                      status=500,
                      content_type='application/json',
                      content=json.dumps("Error"),
                    )
                    
            else:
                if self.DEBUG:
                    print("unknown API path")
                return APIResponse(status=404)
                
        except Exception as e:
            if self.DEBUG:
                print("Failed to handle UX extension API request: " + str(e))
            return APIResponse(
              status=500,
              content_type='application/json',
              content=json.dumps("API Error"),
            )


    def unload(self):
        if self.DEBUG:
            print("Shutting down")
        self.running = False
        time.sleep(1)
        return True



    def save_persistent_data(self):
        if self.DEBUG:
            print("Saving to persistent data store")

        try:
            with open(self.persistence_file_path, 'w') as f:
                if self.DEBUG:
                    print("saving: " + str(self.persistent_data))
                json.dump( self.persistent_data, f, indent=4 )
                return True
                
        except Exception as ex:
            if self.DEBUG:
                print("Error: could not save persistent data to file: " + str(ex) )
        
        return False


    def really_delete_deleted_log_files(self):
        if 'logging_files_to_delete' in self.persistent_data:
            for log_file_path in self.persistent_data['logging_files_to_delete']:
                if self.persistent_data['logging_files_to_delete'][log_file_path] < time.time() - (60 * 60 * 24 * 7):
                    os.remove(log_file_path)
                    del self.persistent_data['logging_files_to_delete'][log_file_path]
                    self.should_save_persistent_data = True
                    if self.DEBUG:
                        print("really deleted old logging file a week later: " + str(log_file_path))
                    
        
                                

def run_command(cmd, timeout_seconds=20):
    try:
        
        p = subprocess.run(cmd, timeout=timeout_seconds, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, universal_newlines=True)

        if p.returncode == 0:
            return p.stdout # + '\n' + "Command success" #.decode('utf-8')
            #yield("Command success")
        else:
            if p.stderr:
                return "Error: " + str(p.stderr) # + '\n' + "Command failed"   #.decode('utf-8'))

    except Exception as ex:
        print("Error running command: "  + str(ex))
        
        
def generate_random_string(length):
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for i in range(length))
    
    
def is_number(s):
    try:
        float(s)
        return True
    except ValueError:
        return False
        
def split_lines_generator(text: str, keepends: bool = False): # -> Generator[str, None, None]:
    """
    Split text into lines and yield them one by one.
    Should be used when the result of text.splitlines() is huge, and you don't want to store it all in memory.
    """
    prevnl = -1
    while True:
        nextnl = text.find('\n', prevnl + 1)
        if nextnl < 0:
            if prevnl == -1:
                yield text
            else:
                if not text.endswith('\n'):
                    yield text[prevnl + 1:]
            break
        if keepends:
            yield text[prevnl + 1:nextnl + 1]
        else:
            yield text[prevnl + 1:nextnl]
        prevnl = nextnl