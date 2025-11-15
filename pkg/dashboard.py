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
        self.greyscale = False
        
        self.cups_printer_available = False
        self.peripage_printer_available = False
        #os.environ["DISPLAY"] = ":0.0"
            
        self.weather_addon_exists = False
        
        
        self.icons_data = {}
        
            
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
            #self.persistence_file_folder = os.path.join(self.user_profile['configDir'])
            self.persistence_file_path = os.path.join(self.user_profile['dataDir'], self.addon_name, 'persistence.json')
            self.external_picture_drop_dir = os.path.join(self.user_profile['dataDir'], 'privacy-manager', 'printme')
            self.display_toggle_path = os.path.join(self.user_profile['addonsDir'], 'display-toggle')
            
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
            with open(self.persistence_file_path) as f:
                self.persistent_data = json.load(f)
                if self.DEBUG:
                    print('self.persistent_data loaded from file: ' + str(self.persistent_data))
                
        except:
            if self.DEBUG:
                print("Could not load persistent data (if you just installed the add-on then this is normal)")
            self.persistent_data = {}
            
        if not 'dashboards' in self.persistent_data:
            self.persistent_data['dashboards'] = {}
            
        self.scan_icons()

        # Screensaver
        if self.display_toggle_path:
            if not os.path.isdir(self.display_toggle_path):
                # Only keep the display on if the display toggle addon isn't installed.
                if self.screensaver_delay > 0:
                    os.system('xset -display :0 s off')
                    os.system('xset -display :0 s noblank')
                    os.system('xset -display :0 -dpms')
            
        # Respond to gateway version
        try:
            if self.DEBUG:
                print("Gateway version: " + self.gateway_version)
        except:
            if self.DEBUG:
                print("self.gateway_version did not exist")
        
        
        
        
        self.ready = True



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

        if 'Interval' in config:
            self.interval = int(config['Interval'])
            if self.DEBUG:
                print("-Interval preference was in config: " + str(self.interval))
                
        if 'Screensaver delay' in config:
            self.screensaver_delay = int(config['Screensaver delay'])
            if self.DEBUG:
                print("-Screensaver delay preference was in config: " + str(self.screensaver_delay))

        if 'Fit to screen' in config:
            self.fit_to_screen = str(config['Fit to screen']) # can be "cover", "contain" or "mix"
            if self.DEBUG:
                print("-Fit to screen preference was in config: " + str(self.fit_to_screen))
                
        if "Animations and effects" in config:
            self.animations = bool(config['Animations and effects']) # can be "cover", "contain" or "mix"
            if self.DEBUG:
                print("Animations preference was in config: " + str(self.animations))
                
        if "Black and white" in config:
            self.greyscale = bool(config["Black and white"]) # can be "cover", "contain" or "mix"
            if self.DEBUG:
                print("Black and white preference was in config: " + str(self.greyscale))
                
        if 'Show date' in config:
            self.show_date = bool(config['Show date'])
            if self.DEBUG:
                print("-Date preference was in config: " + str(self.show_date))

        if 'Show clock' in config:
            self.show_clock = bool(config['Show clock'])
            if self.DEBUG:
                print("-Clock preference was in config: " + str(self.show_clock))

        if 'Show weather' in config:
            self.show_weather = bool(config['Show weather'])
            if self.DEBUG:
                print("-Weather preference was in config: " + str(self.show_weather))

        if 'Show Voco timers' in config:
            self.show_voco_timers = bool(config['Show Voco timers'])
            if self.DEBUG:
                print("-Date preference was in config: " + str(self.show_date))



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
                                state = True
                                
                                return APIResponse(
                                  status=200,
                                  content_type='application/json',
                                  content=json.dumps({'state': state, 
                                                      'dashboards': self.persistent_data['dashboards'],
                                                      'icons': self.icons_data,
                                                      'interval': self.interval,
                                                      'screensaver_delay': self.screensaver_delay, 
                                                      'fit_to_screen': self.fit_to_screen,
                                                      'show_voco_timers': self.show_voco_timers,
                                                      'peripage_printer_available': self.peripage_printer_available, 
                                                      'cups_printer_available': self.cups_printer_available, 
                                                      'weather_addon_exists': self.weather_addon_exists, 
                                                      'animations': self.animations,
                                                      'greyscale': self.greyscale,
                                                      'debug': self.DEBUG
                                                    }),
                                )
                             
                            
                               
                            #   
                            # SAVE
                            #
                            elif action == 'save':
                                
                                state = False
                                if 'dashboards' in request.body:
                                    self.persistent_data['dashboards'] = request.body['dashboards']
                                    self.save_persistent_data()
                                    state = True
                                
                                
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
                                print("GETTING LOG DATA")
                                
                                print("self.user_profile: ", self.user_profile)
                                
                                state = False
                                raw_boolean_log_data = ''
                                raw_numeric_log_data = ''
                                
                                if 'log_ids' in request.body:
                                    try:
                                        log_ids = request.body['log_ids'];
                                        print("log_ids: ", log_ids)
                                        
                                        if len(log_ids) and os.path.exists(self.logs_db_path):
                                            
                                            log_ids_string = ''
                                            for idx, log_id in enumerate(log_ids):
                                                log_ids_string = log_ids_string + log_id
                                                if idx < len(log_ids) - 1:
                                                    log_ids_string = log_ids_string + ', '
                                            
                                            epoch_time = int(time.time()) - (3600 * 24)
                                            epoch_time = epoch_time * 1000
                                            print("get_log_data: log_ids: ", log_ids);
                                            print("get_log_data: 24 hours ago milliseconds timestamp: ", epoch_time);
                                            
                                            # WHERE ID IN (2, 3, 4, 7, 11, 34)
                                            # sqlite3 ~/.webthings/log/logs.sqlite3 'SELECT * FROM metricsNumber WHERE id == 13 AND date > 1762049555000';
                                            
                                            sqlite_binary_path = run_command('which sqlite3')
                                            sqlite_binary_path = sqlite_binary_path.rstrip()
                                            print("SQLITE binary path: ", sqlite_binary_path)
                                            
                                            boolean_command_to_run = sqlite_binary_path + " " + str(self.logs_db_path) + " 'SELECT * FROM metricsBoolean WHERE id IN (" + str(log_ids_string) + ") AND date > " + str(epoch_time) + "';"
                                            print("get_log_data: SQLITE boolean_command to run: ", boolean_command_to_run)
                                            raw_boolean_log_data = run_command(boolean_command_to_run)
                                            
                                            print("raw_boolean_log_data: ", raw_boolean_log_data)
                                            
                                            numeric_command_to_run = sqlite_binary_path + " " + str(self.logs_db_path) + " 'SELECT * FROM metricsNumber WHERE id IN (" + str(log_ids_string) + ") AND date > " + str(epoch_time) + "';"
                                            print("get_log_data: SQLITE numeric_command to run: ", numeric_command_to_run)
                                            raw_numeric_log_data = run_command(numeric_command_to_run)
                                        
                                            print("raw_numeric_log_data: ", raw_numeric_log_data)
                                            
                                            #query_string = "SELECT * FROM metricsBoolean WHERE id IN (" + str(log_ids_string) + ") AND date > " + str(epoch_time) + ";"
                                            #raw_numeric_log_data = subprocess.check_output([str(sqlite_binary_path), str(self.logs_db_path), query_string])
                                        
                                        
                                            #print("raw_numeric_log_data: ", raw_numeric_log_data)
                                        
                                            state = True
                                        
                                    except Exception as ex:
                                        print("caught error getting data from sqlite: ", ex);

                                   
                                
                                
                                return APIResponse(
                                  status=200,
                                  content_type='application/json',
                                  content=json.dumps({
                                                'state': state,
                                                'raw_boolean_log_data': raw_boolean_log_data,
                                                'raw_numeric_log_data': raw_numeric_log_data,
                                            }),
                                )
                                
                                
                            
                                
                            else:
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
                                                  'date':system_date[1], 
                                                  'month':system_date[2], 
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
        return True



    def save_persistent_data(self):
        if self.DEBUG:
            print("Saving to persistence data store")

        try:
            if not os.path.isfile(self.persistence_file_path):
                open(self.persistence_file_path, 'a').close()
                if self.DEBUG:
                    print("Created an empty persistence file")
            else:
                if self.DEBUG:
                    print("Persistence file existed. Will try to save to it.")

            with open(self.persistence_file_path) as f:
                if self.DEBUG:
                    print("saving: " + str(self.persistent_data))
                try:
                    json.dump( self.persistent_data, open( self.persistence_file_path, 'w+' ), indent=4 )
                except Exception as ex:
                    print("Error saving to persistence file: " + str(ex))
                return True
            #self.previous_persistent_data = self.persistent_data.copy()

        except Exception as ex:
            if self.DEBUG:
                print("Error: could not store data in persistent store: " + str(ex) )
            return False



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