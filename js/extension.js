(function() {
    class Dashboard extends window.Extension {
        constructor() {
            super('dashboard');
            //console.log("Adding Dashboard to menu");
            this.addMenuEntry('Dashboard');


            this.kiosk = false;
            if (document.getElementById('virtualKeyboardChromeExtension') != null) {
                document.body.classList.add('kiosk');
                this.kiosk = true;
            }

            this.debug = false;
			this.developer = false;
			
            //console.log(window.API);
            this.content = '';
			this.get_init_error_counter = 0; // set to a higher number if the slow update failed
			this.poll_fail_count = 0; // set to a higher number if the voco actions update failed


            // Screensaver
			this.current_dashboard_number = 0;
			this.last_activity_time = new Date().getTime()
            this.screensaver_delay = 120;
            this.showing_screensaver = false;
            this.previous_last_activity_time = 0;
            this.screensaver_ignore_click = false;

			this.page_visible = true;
			document.addEventListener("visibilitychange", () => {
  			  if (document.hidden) {
  				  if(this.debug){
  					  console.log("dashboard: page became hidden");
  				  }
  				  this.page_visible = false;
  			  } else {
  				  if(this.debug){
  					  console.log("dashboard: page became visible");
  				  }
  				  this.page_visible = true;
  			  }
			});
			
			this.show_clock = true;
			this.show_date = true;
			

            // Printer
            this.peripage_printer_available = false;
			this.cups_printer_available = false;
			this.do_not_show_next_random_dashboard = false; // true when the print modal is open
			

            // Dashboard
            this.dashboards = {}; //{"grid0":{"gridstack":{"cellHeight":50,"margin":5,"minRow":2,"acceptWidgets":true,"subGridOpts":{"cellHeight":50,"column":"auto","acceptWidgets":true,"margin":5,"subGridDynamic":true},"subGridDynamic":true,"children":[{"x":0,"y":0,"content":"0","id":"0"},{"x":0,"y":1,"content":"1","id":"1"},{"x":1,"y":0,"content":"2","id":"2"},{"x":2,"y":0,"w":2,"h":3,"id":"sub0","subGridOpts":{"children":[{"x":0,"y":0,"content":"3","id":"3"},{"x":1,"y":0,"content":"4","id":"4"}],"cellHeight":50,"column":"auto","acceptWidgets":true,"margin":5,"subGridDynamic":true}},{"x":4,"y":0,"h":2,"id":"sub1","subGridOpts":{"children":[{"x":0,"y":0,"content":"5","id":"5"}],"cellHeight":50,"column":"auto","acceptWidgets":true,"margin":5,"subGridDynamic":true}}]}} };
            this.interval = 30;
            this.fit_to_screen = "mix";
            this.clock = false;
            this.show_date = false;
            this.interval_counter = 60; // if it reaches the interval value, then it will show another picture.
            
			//this.current_picture = 1; // two pictures swap places: picture1 and picture2. This is for a smooth transition effect
			this.show_list_called = false;

			this.hide_selected_dashboard_indicator_time = 0;
			//this.dashboard_key_listener_added = false;

			this.slow_interval_counter = 0;
			this.slow_interval = 60;


            // Weather
            this.show_weather = false;
            this.weather_addon_exists = false;
            this.all_things = [];
            this.weather_thing_url = null;
			this.weather_fail_count = 0;


			// Swipe
			this.touchstartX = 0
			this.touchendX = 0


			// Voco timers
			this.show_voco_timers = false;
			this.voco_interval_counter = 6;
			
			this.action_times = [];

			// animations and effects
			this.greyscale = false;
			this.animations = true;


			// Grid
			this.grids = {};
			this.current_grid = null;
			this.current_grid_id = 'grid0';
			this.current_widget_id = null;
			this.highest_spotted_widget_id = 0;
			this.editing = false;

			const stored_grid_id = localStorage.getItem("candle_dashboard_grid_id");
			if(typeof stored_grid_id == 'string' && stored_grid_id.startsWith('grid')){
				this.current_grid_id = stored_grid_id;
				//console.log("found stored grid_id in localstorage: ", this.current_grid_id);
			}
			//console.log("initial this.current_grid_id: ", this.current_grid_id);
			
			this.all_things = null;
			this.last_time_things_updated = 0;
			
			this.logs = null;
			this.last_time_logs_updated = 0;
			this.current_logs = [];
			
			this.icon_dirs = [];
			this.icon_paths = [];
			
			this.created_template_color_wheel = false;
			
			
            this.update_things_data()
			.then((things) => {
				return fetch(`/extensions/${this.id}/views/content.html`)
			})
            .then((res) => res.text())
            .then((text) => {
                this.content = text;
				this.early_init();
            })
            .catch((e) => console.error('Failed to fetch content:', e));
			

			//console.log("window: ", window);
			//console.log("window.AGateway: ", window.AGateway);
			//console.log("window.API: ", window.API);
		
			this.websockets = {};
			this.websockets_lookup = {}; // quick lookup which properties of which things are represented in the dashboard
			
			
			
			// likely becomes null at this point, since show() has not been called yet
			this.modal_el = document.getElementById('extension-dashboard-widget-modal');
			
			
			/*
			// Listen for keyboard mouse arrow presses
			this.dashboard_key_listener = (event) => {
				//console.log("in dashboard_key_listener. Event: ", event);
				//console.log("in dashboard_key_listener. this: ", this);
				const arrow_key = event.key; // "ArrowRight", "ArrowLeft", "ArrowUp", or "ArrowDown"
				//console.log("dashboard_key_listener: arrow_key: ", arrow_key);
				if(arrow_key == 'ArrowRight'){
					this.next_dashboard();
				}
				else if(arrow_key == 'ArrowLeft'){
					this.previous_dashboard();
				}
			}
			*/

        }



		update_things_data(){
			//console.log("in update_things_data.  last_time_things_updated: ", this.last_time_things_updated);
			let promise = new Promise((resolve, reject) => {
				
				if(this.last_time_things_updated < (Date.now() - 60000) || this.all_things == null){
					//console.log("it has been at least a minute since the things data was last updated");
					
					API.getThings()
					.then((things) => {
						
						//console.log("dashboard: got fresh things list from API");
						
		                function compare(a, b) {
                
							const thingA = a.title.toUpperCase();
							const thingB = b.title.toUpperCase();

							if (thingA > thingB) {
								return 1;
							} else if (thingA < thingB) {
								return -1;
							}
							return 0;
		                }

						if(Object.keys(things).length == 0){
							console.error("dashboard: generate_thing_selector: no things?");
							//alert("You don't seem to have any things");
							reject(null);
						}
		                things.sort(compare);
		                //console.log("sorted things: ", things);
        
		    			this.all_things = things;
						this.last_time_things_updated = Date.now();
		    			//console.log("followers: all things: ", things);
		    			//console.log(things);
						resolve(things);
					})
					.then((things) => {
			            return API.getLogs()
					})
					.then((logs) => {
						//console.log("window.API: ", window.API);
						//console.log("update_things_data: API.getlogs: ", logs);
		                if(this.debug){
		                    console.log("update_things_data: API.getlogs: ", logs);
		                }
						this.logs = logs;
						resolve(this.all_things);    
					})
					.catch((err) => {
						console.error("dashboard: caught error in update_things_data: ", err);
					})
				}
				else{
					resolve(this.all_things);
				}
			});
			return promise;
		}



		update_logs_data(){
			//console.log("in update_logs_data.  last_time_logs_updated: ", this.last_time_logs_updated);
			let promise = new Promise((resolve, reject) => {
				
				if(this.last_time_logs_updated < (Date.now() - 60000) || this.logs == null){
					//console.log("it has been at least a minute since the logs data was last updated");
					
					API.getLogs()
					.then((logs) => {
						
						//console.log("dashboard: got fresh logs list from API");
						
		                function compare(a, b) {
                
							const thingA = a.thing.toUpperCase();
							const thingB = b.thing.toUpperCase();

							if (thingA > thingB) {
								return 1;
							} else if (thingA < thingB) {
								return -1;
							}
							return 0;
		                }

						if(Object.keys(logs).length == 0){
							console.error("dashboard: generate_log_selector: no logs?");
							//alert("You don't seem to have any things");
							reject(null);
						}
		                logs.sort(compare);
		                //console.log("sorted things: ", things);
        
		    			this.logs = logs;
						this.last_time_logs_updated = Date.now();
		    			//console.log("followers: all things: ", things);
		    			//console.log(things);
						resolve(logs);
					})
					.catch((err) => {
						console.error("dashboard: caught error in update_logs_data: ", err);
					})
				}
				else{
					resolve(this.logs);
				}
			});
			return promise;
		}





		early_init(){
            
			//console.log("dashboard debug: in early_init");
			
            window.API.postJson(
                `/extensions/dashboard/api/ajax`, {
                    'action': 'init'
                }

            ).then((body) => {
				if(typeof body.debug !== 'undefined'){
					this.debug = body.debug;
				}
            	
                if (this.debug) {
                    console.log("dashboard debug: early init response: ");
                    console.log(body);
                }
				
				if(typeof body['dashboards'] != 'undefined'){
                    this.dashboards = body['dashboards'];
					//console.log("received dashboards data from backend: ", JSON.stringify(body['dashboards'],null,4));
				}
				
				if(typeof body['icons'] != 'undefined'){
                    this.icons = body['icons'];
					//console.log("received icons data from backend: ", this.icons);
					this.parse_icons();
				}
				
                if (document.location.href.endsWith("dashboard")) {
					//console.log("on dashboard url, calling this.show immediately");
                    this.show();
                }
				
            }).catch((err) => {
                console.error("Dashboard: error in early init function: ", err);
            });
		}



		

		//
		//  SHOW
		//

        show() {
            //console.log("in dashboard show.  this.view: ", this.view);

            if (this.content == '') {
                return;
            } else {
                this.view.innerHTML = this.content;
            }
			
			//this.current_picture = 1; // which of the two picture holders is on top
			//this.do_not_show_next_random_dashboard = false;
			
			if(document.body.classList.contains('developer')){
				this.developer = true;
			}
			else{
				this.developer = false;
			}


			let content_el = document.getElementById('extension-dashboard-content');
			if(content_el){
				
				/*
				if(this.dashboard_key_listener_added == false){
					//this.dashboard_key_listener_added = true;
					
					try{
						//document.removeEventListener("keydown", this.list);
						
						document.removeEventListener("keydown", this.dashboard_key_listener);
						//console.log("past event listener removal");
					}
					catch(e){
						//console.log("dashboard: show: no keylistener to remove");
					}
					document.addEventListener('keydown', this.dashboard_key_listener, { passive: true });
					//document.addEventListener('keydown', this.list);
				}
				
				*/
				
				
				
				//document.addEventListener('keydown', this.dashboard_key_listener); //.bind(this);
				//content_el.removeEventListener("keydown", this.dashboard_key_listener);
				//content_el.addEventListener('keydown', this.dashboard_key_listener);
				
				this.modal_el = document.getElementById('extension-dashboard-widget-modal');
				
				
			}
			else{
				console.error("dashboard: no content element?");
				return;
			}


			
			
			
			
			
			
			
			
			
			
			
			
			
           
            


            // EVENT LISTENERS

			// manage dashboards button
            document.getElementById("extension-dashboard-edit-button-container").addEventListener('click', () => {
                //event.stopImmediatePropagation();
				
				const content_el = document.getElementById('extension-dashboard-content');
				if(this.hasClass(content_el,'extension-dashboard-editing')){
					content_el.classList.remove('extension-dashboard-editing');
					this.editing = false;
					//console.log("this.modal_el: ", this.modal_el);
					//console.log("this.modal_el.open: ", this.modal_el.open);
					if(this.modal_el.open){
						this.modal_el.close();
					}
					
					this.save_grid();
					if(this.modal_el == null){
						console.warn("had to create this.modal_el again!");
						this.modal_el = document.getElementById('extension-dashboard-widget-modal');
					}
					
				}
				else{
					content_el.classList.add('extension-dashboard-editing');
					this.editing = true;
					this.show_dashboard(); // redraw the grid, but this time allowed modifying it
				}
				
				
            });
			
			
			
			
			// Clicking on dashboard to close overlay?
            document.getElementById("extension-dashboard-main-page").addEventListener('click', () => {
				if(this.modal_el && this.modal_el.open){
					this.modal_el.close();
				}
            });
			
			
			if(!document.getElementById("extension-dashboard-main-page").classList.contains('extension-dashboard-has-swipe-listener')){
				document.getElementById("extension-dashboard-main-page").classList.add('extension-dashboard-has-swipe-listener');
			
				document.getElementById("extension-dashboard-main-page").addEventListener('touchstart', e => {
					if(this.debug){
						console.log("dashboard: touch start");
					}
					this.touchstartX = e.changedTouches[0].screenX;
				}, {
            		passive: true
        		});

				document.getElementById("extension-dashboard-main-page").addEventListener('touchend', e => {
					this.touchendX = e.changedTouches[0].screenX;
					this.check_swipe_direction();
				}, {
            		passive: true
        		});
			}
				
			
			
			// TIMER LOOP

			setTimeout(() => {
	            this.dashboard_interval = setInterval(() => {
					
					//console.log("in dashboard_interval.  interval_counter,slow_interval_counter: ", this.interval_counter, this.slow_interval_counter);
					if(this.page_visible){
						this.interval_counter++;
						this.slow_interval_counter++
						
						// change to new random picture after X seconds
		                if (this.interval_counter > this.interval) {
							//console.log("slow interval: seconds passed: ", this.interval_counter);
							this.interval_counter = 0;
		                    
							this.render_logs(); // every 30 seconds update any visible log widgets
		                }
				
						// Every X seconds run the slow update of settings
						if (this.slow_interval_counter > this.slow_interval) {
							this.slow_interval_counter = 0;
					
							// if there are network connection issues, wait before doing the next request until this counter is zero again.
							if(this.get_init_error_counter > 0){
								this.get_init_error_counter--;
							}
					
							//this.get_init();
						}
				
				
						// every X seconds run the Voco timers poll interval
						if(this.show_voco_timers){
						
							this.voco_interval_counter++;
					
							if(this.voco_interval_counter > 5){
								this.voco_interval_counter = 0;
								if(this.poll_fail_count > 0){
									if(this.debug){
										console.warn("dashboard: delaying voco polling after a failed poll. this.poll_fail_count: ", this.poll_fail_count);
									}
									this.poll_fail_count--;
								}
								else{
									this.get_poll();
								}
							}
							
							// every second adjust the second counters of voco timers
							this.update_voco_actions();
						}
					
				
						//console.log("this.show_clock: ", this.show_clock);
						// At the start of each new minute update the clock
						if (this.show_clock) {
							if ( new Date().getSeconds() === 0 ){
								this.update_clock();
							}
						};
						
					}
					
	                //console.log(this.interval_counter);
	            }, 1000);
				
				
				/*
				// Add key listener
				try{
					document.removeEventListener("keydown", this.dashboard_key_listener); // remove existing keylistener if it exists, to avoid doubling.
					//console.log("past event listener removal");
				}
				catch(e){
					if(this.debug){
						//console.log("dashboard: show: no keylistener to remove.  e:", e);
					}
				}
				document.addEventListener('keydown', this.dashboard_key_listener, { passive: true });
				*/
				
			},2000);
            
			
			
			this.get_init()
			.then((body) => {
				//if(this.debug){
				//	console.log("dashboard debug: show: get_init promise returned: ", body);
				//}
				
				if(typeof body.dashboards != 'undefined'){
					this.dashboards = body.dashboards;
				}
				
				if(typeof body.icons != 'undefined'){
					this.icons = body.icons;
					this.parse_icons();
				}
				
				this.update_sidebar();
				this.show_dashboard();
				
				this.update_clock();
				
			}).catch((e) => {
				if (this.debug) {
					console.error("Dashboard: get_init promise error: ", e);
				}
			});
			
			

            /*
			document.getElementById("extension-dashboard-back-button").addEventListener('click', () => {
				const picture_holder = document.getElementById('extension-dashboard-main-page');
				const overview = document.getElementById('extension-dashboard-overview');
				this.addClass(overview,"extension-dashboard-hidden");
				this.removeClass(picture_holder,"extension-dashboard-hidden");
			});
        	*/

			

			document.getElementById('extension-dashboard-templates').addEventListener('click', (event) => {
				if(event.target.classList.contains('extension-dashboard-template')){
					let widget_type = event.target.getAttribute('data-template-name');
					if(typeof widget_type == 'string'){
						//console.log("calling generate_widget_content with widget_type: ", widget_type);
						
						const modal_ui_container_el = this.modal_el.querySelector('#extension-dashboard-widget-modal-ui-container');
						if(modal_ui_container_el){
							modal_ui_container_el.innerHTML = '';
						}
						if(typeof this.dashboards[this.current_grid_id] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'][this.current_widget_id] != 'undefined'){
							this.dashboards[this.current_grid_id]['widgets'][this.current_widget_id] = {}
						}
						
						this.generate_widget_content(this.current_grid_id, this.current_widget_id, widget_type);
						
						this.set_highlighted_modal_template(this.current_grid_id, this.current_widget_id, widget_type);
						
						document.getElementById('extension-dashboard-widget-modal-ui-container').scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
					}
					
				}
				
				//this.generate_widget_content(this.current_grid_id, this.current_widget_id,'property-switch');
			});
			
			
			document.getElementById('extension-dashboard-widget-modal-cancel-button').addEventListener('click', () => {
				this.modal_el.close();
			});
			
			
			document.getElementById('extension-dashboard-widget-modal-save-button').addEventListener('click', () => {
				//console.log("clicked on widget modal save button");
				//console.log("this.modal_el: ", this.modal_el);
				//console.log("this.modal_el.open: ", this.modal_el.open);
				//console.log("calling model_el.close()");
				
				//this.modal_el.close();
				document.getElementById('extension-dashboard-widget-modal').close();
				//console.log("- this.modal_el.open before generate_widget_content is now: ", this.modal_el.open);
				
				this.generate_widget_content(this.current_grid_id, this.current_widget_id);
				//console.log("- this.modal_el.open after generate_widget_content is now: ", this.modal_el.open);
				
				setTimeout(() => {
					//console.log("- this.modal_el.open after generate_widget_content PLUS A SECOND is now: ", this.modal_el.open);
				},1000);
				
				const last_edited_widget_type = this.get_last_edited_widget_type();
				//console.log("last_edited_widget_type: ", last_edited_widget_type);
				
				if(last_edited_widget_type == 'log'){
					this.render_logs();
				}
				
				
			});
			
			
			
			
		} // and of show function



        hide() {
			
			
            try {
				if(this.dashboard_interval){
					window.clearInterval(this.dashboard_interval);
				}
				this.dashboard_interval = null;
            } catch (err) {
                console.warn("dashboard: error, could not clear dashboard_interval: ", err);
            }
			
			/*
			try{
				document.removeEventListener("keydown", this.dashboard_key_listener);
				//console.log("dashboard: hide: past event listener removal");
			}
			catch(e){
				if(this.debug){
					console.error("dashboard: hide: no keylistener to remove? ", e);
				}
			}
            try {
				//document.body.removeEventListener("keydown", this.dashboard_key_listener, { passive: true });
            } catch (e) {
                console.warn("dashboard: error removing key listener: ", e);
            }
			*/

        }





		



		//
		//   INIT - get updates about settings and available dashboards
		//

        // only called by show()
		get_init(){
			
			return new Promise((resolve, reject) => {
				
				if(this.get_init_error_counter == 0){
		            window.API.postJson(
		                `/extensions/${this.id}/api/ajax`, {
		                    'action': 'init'
		                }
		            ).then((body) => {
						if(this.debug){
							console.log("dashboard debug: get_init response: ", body);
						}
						this.get_init_error_counter = 0;
						
						resolve(body);
					
		            }).catch((e) => {
		                if (this.debug) {
							console.log("Dashboard: get_init error: ", e);
						}
						this.get_init_error_counter = 3;
						reject({});
		            });
				}
				else{
					reject({});
				}
				
			});
			
		}
		
		
	
		
		// A general api response parser
		update_list(body){
			//console.log("dashboard: in update_list.  body: ", body);
			try{
				
				if(typeof body.debug != 'undefined'){
					this.debug = body.debug;
				}
				
                if (this.debug) {
                    console.log("dashboard debug: in update_list.  body: ", body);
                }
				
				// Voco timers
				if(typeof body.show_voco_timers != 'undefined'){
					this.show_voco_timers = body.show_voco_timers;
				}

				// TODO could be fun to allow a greyscale filteron the dashboard
				if(this.greyscale){
					document.getElementById('extension-dashboard-content').classList.add('extension-dashboard-greyscale');
				}
				else{
					document.getElementById('extension-dashboard-content').classList.remove('extension-dashboard-greyscale');
				}
				
			}
            catch(e){
            	if (this.debug) {
					console.error("dashboard: error parsing update list data: ", e);
				}
            }
			
		}


		// Takes received icons folder data and sorts it into two lists; one of folder names, to be used as tags in the UI, and one as a list of all the icon paths, which is used for searching
		parse_icons(){
			//console.log("in parse_icons.  this.icons: ", this.icons);
			let icon_dirs = [];
			let icon_paths = [];
			
			const walk_icons = (icons_dict,path_so_far="") => {
				if(icons_dict){
					for (const [key, value] of Object.entries(icons_dict)) {
						if(typeof key == 'string' && key.endsWith('.svg')){
							icon_paths.push(path_so_far + '/' + key);
						}
						else if(typeof value == 'object' && value != null){
							if(typeof key == 'string'){
								icon_dirs.push(key);
								walk_icons(value,path_so_far + '/' + key);
							}
							
						}
					}
				}
			}
			
			if(this.icons){
				walk_icons(this.icons);
			}
			
			//console.log("parse_icons:  icon_dirs: ", icon_dirs);
			//console.log("parse_icons:  icon_paths: ", icon_paths);
			this.icon_dirs = icon_dirs;
			this.icon_paths = icon_paths;
		}




		update_sidebar(action=null){
			//console.log("in update_sidebar. Action: ", action);
			
			let tabs_menu_el = document.getElementById('extension-dashboard-tab-menu');
			if(tabs_menu_el){
				const dashboards_keys = Object.keys(this.dashboards);
				
				
				if(action == 'add_dashboard'){
					let new_grid_id = null;
					var new_grid_index = 0;
					while (typeof this.dashboards['grid' + new_grid_index] != 'undefined'){
						new_grid_index++;
					}
					new_grid_id = 'grid' + new_grid_index;
					this.dashboards[new_grid_id] = {};
					setTimeout((new_grid_id) => {
						this.show_dashboard(new_grid_id);
					},50);
				}
				
				tabs_menu_el.innerHTML = '';
				
				// ADD DROPZONE TO REMOVE WIDGET
				
				let trash_zone_container_el = document.createElement('div');
				trash_zone_container_el.classList.add('extension-dashboard-trash-container');
				
				let trash_zone_el = document.createElement('div');
				trash_zone_el.setAttribute('id','extension-dashboard-trash');
				trash_zone_el.classList.add('extension-dashboard-show-if-editing');
				trash_zone_el.addEventListener('click', () => {
					alert("Drag and drop a widget here to remove it");
					
					// removeWidget(this.parentElement.parentElement)
				});
				/*
				document.addEventListener('dragenter', (event) => {
					event.preventDefault();
					//console.log("dragging over trash? ", event.target.tagName);
					trash_zone_el.classList.add('extension-dashboard-drag-over-scale');
				});
				trash_zone_container_el.addEventListener('dragout', (event) => {
					event.preventDefault();
					//console.log("dragging out of trash");
					trash_zone_el.classList.remove('extension-dashboard-drag-over-scale');
				});
				trash_zone_container_el.addEventListener('mouseOver', (event) => {
					event.preventDefault();
					//console.log("mousing over trash");
					trash_zone_el.classList.add('extension-dashboard-drag-over-scale');
				});
				
				trash_zone_container_el.addEventListener('dragenter', function(event) {
				    this.style.backgroundColor = '#f0f0f0';
				});

				trash_zone_container_el.addEventListener('dragleave', function(event) {
				    this.style.backgroundColor = '';
				});
				*/
				
				/*
				trash_zone_el.addEventListener("mouseout", () => { 
					//console.log("mouse moved out of trash");
					trash_zone_el.classList.remove('extension-dashboard-drag-over-scale');
				})
				*/
				
				//trash_zone_container_el.appendChild(trash_zone_el);
				//tabs_menu_el.appendChild(trash_zone_container_el);
				tabs_menu_el.appendChild(trash_zone_el);
				
				
				// ADD BUTTON TO ADD WIDGET
				
				let add_widget_button_el = document.createElement('div');
				add_widget_button_el.setAttribute('id','extension-dashboard-add-widget-button');
				add_widget_button_el.classList.add('extension-dashboard-show-if-editing');
				//add_widget_button_el.textContent = '+';
				add_widget_button_el.addEventListener('click', () => {
					this.add_main_widget();
				})
				tabs_menu_el.appendChild(add_widget_button_el);
				
				
				//console.log("dashboards_keys.length: ", dashboards_keys.length);
				
				if(dashboards_keys.length > 1){
					let tab_buttons_container = document.createElement('div');
					tab_buttons_container.setAttribute('id','extension-dashboard-tab-buttons-container');
					tab_buttons_container.classList.add('extension-dashboard-flex');
					
					const tabs_container_el = document.getElementById('extension-dashboard-tabs');
					if(tabs_container_el){
						for (const [grid_id, details] of Object.entries(this.dashboards)) {
							//console.log(`) ) ) ${grid_id}: ${details}`);
					
							let tab_el = document.querySelector('#extension-dashboard-tab-' + grid_id);
							
							if(tab_el == null){
								//console.log("adding a new dashboard tab");
								let new_tab_el = document.createElement('div');
								new_tab_el.setAttribute('id','extension-dashboard-tab-' + grid_id);
								new_tab_el.classList.add('extension-dashboard-tab');
								
								if(grid_id == this.current_grid_id){
									new_tab_el.classList.add('extension-dashboard-tab-selected');
									if(this.current_grid_id != 'grid0'){
										document.getElementById('extension-dashboard-tab-grid0').classList.remove('extension-dashboard-tab-selected');
									}
								}
								
								let grid_container_el = document.createElement('div');
								grid_container_el.setAttribute('id','extension-dashboard-' + grid_id);
								grid_container_el.classList.add('container-fluid');
								
								new_tab_el.appendChild(grid_container_el);
								
								tabs_container_el.appendChild(new_tab_el);
							}
							else{
								//console.log("the tab element already seems to exist: ", tab_el);
								tab_el.classList.add('extension-dashboard-tab-selected');
							}
							// let existing_tab = document.getElementById('extension-dashboard-tabs-')
					
							
					
							let show_dashboard_button_el = document.createElement('div');
							show_dashboard_button_el.setAttribute('id','extension-dashboard-show-' + grid_id);
					
							if(grid_id == this.current_grid_id){
								show_dashboard_button_el.classList.add('extension-dashboard-tab-button-selected');
							}
							
					
							let grid_button_text = grid_id.replaceAll('grid','');
							if(typeof details['name'] == 'string' && details['name'].length){
								grid_button_text = details['name'];
							}
							show_dashboard_button_el.textContent = grid_button_text;
							show_dashboard_button_el.addEventListener('click', () => {
								if(this.editing){
									this.save_grid();
								}
								this.show_dashboard(grid_id);
							})
							tab_buttons_container.appendChild(show_dashboard_button_el);
					
						}
					}
					
					tabs_menu_el.appendChild(tab_buttons_container);
				}
				
				
				// ADD BUTTON TO ADD NEW DASHBOARD TAB
				
				let add_dashboard_button_el = document.createElement('div');
				add_dashboard_button_el.setAttribute('id','extension-dashboard-add-dashboard-button');
				add_dashboard_button_el.classList.add('extension-dashboard-show-if-editing');
				//add_dashboard_button_el.textContent = '+';
				add_dashboard_button_el.addEventListener('click', () => {
					this.update_sidebar('add_dashboard');
				})
				tabs_menu_el.appendChild(add_dashboard_button_el);
				
			}
		}



		
		// swipe left or right on a dashboard to navigate between them
		// TODO currently not enabled
		check_swipe_direction() {
			if(this.debug){
				console.log('dashboard debug: in check_swipe_direction');
			}
			//this.last_activity_time = new Date().getTime();
			if (this.touchendX < this.touchstartX - 50){
				if(this.debug){
					console.log('dashboard: swiped left');
				}
				this.next_dashboard_tab();
			}
			if (this.touchendX > this.touchstartX + 50){
				if(this.debug){
					console.log('dashboard: swiped right');
				}
				this.previous_dashboard_tab();
			}
	
		}


		// TODO swiping between dashboards is not yet implemented
		previous_dashboard_tab(){
			if(this.debug){
				console.log("previous_dashboard_tab: before this.current_dashboard_number: ", this.current_dashboard_number);
			}
			this.current_dashboard_number--;
			if(this.current_dashboard_number < 0){
				this.current_dashboard_number = this.dashboards.length - 1;
			}
			this.show_dashboard( 'grid' + this.dashboards[this.current_dashboard_number] );
			if(this.debug){
				console.log("dashboard: previous_dashboard: after this.current_dashboard_number: ", this.current_dashboard_number);
			}
			//this.show_selected_dashboard_indicator();
		}

		next_dashboard_tab(){
			if(this.debug){
				console.log("next_dashboard_tab: before this.current_dashboard_number: ", this.current_dashboard_number);
			}
			this.current_dashboard_number++;
			if(this.current_dashboard_number >= this.dashboards.length){
				this.current_dashboard_number = 0;
			}
			this.show_dashboard( 'grid' + this.dashboards[this.current_dashboard_number] );
			if(this.debug){
				console.log("dashboard: next_dashboard: after this.current_dashboard_number: ", this.current_dashboard_number);
			}
			//this.show_selected_dashboard_indicator();
		}


		// provides dashboard settings with thre initial empty widgets
		new_dashboard(){
			
		    let subOptions = {
				cellWidth: 'auto',
				column: 'auto', // size to match container
				acceptWidgets: true, // will accept .grid-stack-item by default
				margin: 15,
				subGridDynamic: true, // make it recursive for all future sub-grids
		    };
		    let main = [{x:2, y:2}, {x:0, y:1}, {x:1, y:0}]
		    let sub1 = [{x:0, y:0}];
		    let sub0 = [{x:0, y:0}, {x:1, y:0}];
		    // let sub0 = [{x:0, y:0}, {x:1, y:0}, {x:1, y:1, h:2, subGridOpts: {children: sub1, ...subOptions}}];
		    let options = { // main grid options
          	  cellWidth: 'auto',
  		      margin: 15,
  		      minRow: 2, // don't collapse when empty
  		      acceptWidgets: true,
			  removable: '#extension-dashboard-trash',
  			  columnOpts: {
  			      breakpoints: [
					{ w: 10000, c: 8, layout: 'moveScale' },
					{ w: 2000, c: 8, layout: 'moveScale' },
					{ w: 1800, c: 8, layout: 'moveScale' },
					{ w: 1650, c: 7, layout: 'moveScale' },
					{ w: 1500, c: 6, layout: 'moveScale' },
					{ w: 1350, c: 6, layout: 'moveScale' },
  			        { w: 1200, c: 6, layout: 'moveScale' },
  					{ w: 1024, c: 5, layout: 'compact' },
  					{ w: 800, c: 4, layout: 'compact' },
  			        { w: 768, c: 3, layout: 'compact' },
  			        { w: 480, c: 2, layout: 'list' }
  			      ]
  			  },
  		      subGridOpts: subOptions,
  		      subGridDynamic: false, // v7 api to create sub-grids on the fly
  		      children: [
  		        ...main,
  		        //{x:2, y:0, w:2, h:3, id: 'sub0', subGridOpts: {children: sub0, ...subOptions}},
  		        //{x:4, y:0, h:2, id: 'sub1', subGridOpts: {children: sub1, ...subOptions}},
  		        // {x:2, y:0, w:2, h:3, subGridOpts: {children: [...sub1, {x:0, y:1, subGridOpts: subOptions}], ...subOptions}/*,content: "<div>nested grid here</div>"*/},
  		      ]
		    };
		    let count = 0;
		    // create unique ids+content so we can incrementally load() and not re-create anything (updates)
			[...main, ...sub0, ...sub1].forEach(d => d.id = ('widget' + String(count++)));
			
			//console.log("GRID OPTIONS: ", options);
			
			return options;
		}
		
		
		
		// TODO allow sub-grids as a form of grouping?
		show_dashboard(grid_id=null){
			if(grid_id == null){
				grid_id = this.current_grid_id;
			}
			
			if(this.debug){
				console.log("dashboard debug: in show_dashboard.  grid_id: ", grid_id);
			}
			
			if(typeof this.dashboards[grid_id] == 'undefined'){
				console.error("dashboard: show_dashboard: that dashboard does not exist. Creating it now: ", grid_id);
				this.dashboards[grid_id] = {};
				//return
			}
			
			this.highest_spotted_widget_id = 0;
			
			this.current_logs = []; // keep track of which logs need to be rendered later
			
			this.current_grid_id = grid_id;
			localStorage.setItem("candle_dashboard_grid_id", grid_id);
			
			if(typeof this.dashboards[grid_id]['gridstack'] == 'undefined'){
				console.warn("show_dashbooard: no gridstack data in dashboard_data for index: ", grid_id);
				this.dashboards[grid_id]['gridstack'] = this.new_dashboard();
			}
			
			const gridstack_container = document.querySelector('#extension-dashboard-' + grid_id);
			
			if(gridstack_container){
				
				const tabs_menu_container_el = document.getElementById('extension-dashboard-tab-buttons-container');
				if(tabs_menu_container_el){
					for(let tc = 0; tc < tabs_menu_container_el.children.length; tc++){
						tabs_menu_container_el.children[tc].classList.remove('extension-dashboard-tab-button-selected');
					}
					document.querySelector('#extension-dashboard-show-' + grid_id).classList.add('extension-dashboard-tab-button-selected');
				}
				
				const tabs_container_el = document.getElementById('extension-dashboard-tabs');
				if(tabs_container_el){
					for(let tc = 0; tc < tabs_container_el.children.length; tc++){
						tabs_container_el.children[tc].classList.remove('extension-dashboard-tab-selected');
					}
					document.querySelector('#extension-dashboard-tab-' + grid_id).classList.add('extension-dashboard-tab-selected');
				}
				
				gridstack_container.innerHTML = '';
				
				if(this.editing == false){
					this.dashboards[grid_id]['gridstack']['static'] = true;
				}
				
				this.grids[grid_id] = GridStack.addGrid(gridstack_container, this.dashboards[grid_id]['gridstack']);
				this.current_grid = this.grids[grid_id];
				
				//console.log("searching for: ", '#extension-dashboard-' + grid_id + ' .grid-stack-item');
				let widget_els = document.querySelectorAll('#extension-dashboard-' + grid_id + ' .grid-stack-item');
				//console.log("widget_els.length: ", widget_els.length);
				for(let w = 0; w < widget_els.length; w++){
					const widget_id = widget_els[w].getAttribute('gs-id');
					if(typeof widget_id == 'string' && widget_id.startsWith('widget')){
						
						let widget_id_number = parseInt(widget_id.replaceAll('widget',''));
						if(widget_id_number > this.highest_spotted_widget_id){
							this.highest_spotted_widget_id = widget_id_number;
						}
						widget_els[w].setAttribute('id','extension-dashboard-' + grid_id + '-' + widget_id);
						
						if(typeof this.dashboards[grid_id]['widgets'] == 'undefined'){
							this.dashboards[grid_id]['widgets'] = {};
						}
						
						this.generate_widget_content(grid_id,widget_id);
						
					}
					else{
						console.error("dashboard: invalid widget_id: ", widget_id);
					}
				}
				
				
			    this.current_grid.on('added removed change', function(e, items) {
					let str = '';
					items.forEach(function(item) { str += ' (x,y)=' + item.x + ',' + item.y; });
					//console.log(e.type + ' ' + items.length + ' items:' + str );
					if(e.type == 'removed'){
						document.getElementById('extension-dashboard-trash').classList.remove('extension-dashboard-drag-over-scale');
						
						if(typeof this.current_grid_id == 'string' && typeof this.current_widget_id == 'string' && typeof this.dashboards[this.current_grid_id] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'][this.current_widget_id] != 'undefined'){
							//console.log("removing old data from this.dashboards: ", JSON.stringify(this.dashboards[this.current_grid_id]['widgets'][this.current_widget_id],null,4));
							delete this.dashboards[this.current_grid_id]['widgets'][this.current_widget_id];
						}
					}
			    });
				
				this.update_clock();
				this.connect_websockets();
				
				this.render_logs();
				
			}
		    
			
			//console.log("show_dashboard:  grid_id, this.highest_spotted_widget_id: ", grid_id, this.highest_spotted_widget_id);

			// grid.removeWidget() // feed it with the element

			// This adds a sub-grid (widget container)
		    function addNewWidget(i) {
  		      	let subGrid = document.querySelectorAll('grid' + dashboard_index + ' .grid-stack-nested')[i]?.gridstack;
  		      	if (!subGrid) return;
    		    let node = {
    		        // x: Math.round(6 * Math.random()),
    		        // y: Math.round(5 * Math.random()),
    		        // w: Math.round(1 + 1 * Math.random()),
    		        // h: Math.round(1 + 1 * Math.random()),
    		        content: String(count++)
    		    };
    		    subGrid.addWidget(node);
    		    return false;
		    };
			
			// TODO let user delete a full dashboard tab by dragging it's number onto the trash icon
		    function destroy(full = true) {
		      if (!grid) return;
		      if (full) {
		        grid.destroy();
		        grid = undefined;
		      } else {
		        grid.removeAll();
		      }
		    }
			
		    function load(full = true) {
		      // destroy(full); // in case user didn't call
		      if (full || !grid) {
		        grid = GridStack.addGrid(document.querySelector('.extension-dashboard-tab-selected .container-fluid'), options);
		      } else {
		        grid.load(options);
		      }
		    }
			
		}


		// Adds a widget to the current dashboard. 
		// TODO In theory adding 'sub-widget', which acts like a widget container, could also be implemented
	    add_main_widget(grid_id=null) {
			if(grid_id == null){
				grid_id = this.current_grid_id;
			}
			
			//console.log("in add_main_widget.  grid_id: ", grid_id);
			if(typeof grid_id != 'string'){
				console.error("dashboard: add_main_widget: no valid grid_id: ", grid_id);
				return
			}
			if(typeof this.grids[grid_id] != 'undefined'){
				this.highest_spotted_widget_id++;
				const widget_id = "widget" + this.highest_spotted_widget_id;
				const brand_new_widget_el = this.grids[grid_id].addWidget({x:0, y:100, content:"",id:widget_id});
				if(brand_new_widget_el){
					brand_new_widget_el.setAttribute('id','extension-dashboard-' + grid_id + '-' + widget_id);
					
					const widget_content_el = brand_new_widget_el.querySelector('.grid-stack-item-content');
				
					if(widget_content_el){
						//console.log("- found the widget_content_el for brand new widget");
					
						widget_content_el.innerHTML = '';
					
						let configure_widget_button_el = document.createElement('div');
						configure_widget_button_el.classList.add('extension-dashboard-show-if-editing');
						configure_widget_button_el.classList.add('extension-dashboard-configure-widget-button');
						configure_widget_button_el.textContent = " ";
						configure_widget_button_el.addEventListener('click', () => {
							//console.log("clicked on configure widget button. calling show_modal.");
							this.current_widget_id = widget_id;
							this.show_modal(grid_id,widget_id);
						})
						widget_content_el.appendChild(configure_widget_button_el);
					
					}
					else{
						console.error("dashboard: found widget element, but could not find widget content element: " + grid_id + '-' + widget_id);
					}
					
				}
				//console.log("brand_new_widget_el?: ", brand_new_widget_el);
			}
			else{
				console.error("dashboard: could not add widget to non-existing grid with  grid_id: ", grid_id);
			}
	    }
	   	
		
		get_last_edited_widget_type(grid_id=null,widget_id=null){
			if(grid_id == null){
				grid_id = this.current_grid_id;
			}
			if(widget_id == null){
				widget_id = this.current_widget_id;
			}
			//console.log("get_last_edited_widget_type:  grid_id,widget_id: ", grid_id,widget_id);
			
			if(grid_id == null || widget_id == null){
				console.warn("get_last_edited_widget_type: no valid widget_id provided/available");
				return null
			}
			
			if(typeof this.dashboards[grid_id] != 'undefined' && typeof this.dashboards[grid_id]['widgets'] != 'undefined' && typeof this.dashboards[grid_id]['widgets'][widget_id] != 'undefined' && typeof this.dashboards[grid_id]['widgets'][widget_id]['type'] == 'string'){
				//console.log("get_last_edited_widget_type:  ", this.dashboards[grid_id]['widgets'][widget_id]);
				return this.dashboards[grid_id]['widgets'][widget_id]['type'];
			}
			return null
			
		}
		
		
		// SET HIGHLIGHTED TEMPLATES LIST ITEM
		set_highlighted_modal_template(grid_id=null,widget_id=null,widget_type=""){
			
			if(grid_id == null){
				grid_id = this.current_widget_id;
			}
			if(widget_id == null){
				widget_id = this.current_widget_id;
			}
			if(grid_id == null || widget_id == null){
				console.warn("set_highlighted_modal_template: no valid widget_id provided/available");
				return null
			}
			
			//console.log("in set_highlighted_modal_template.  grid_id,widget_id,widget_type: ", grid_id,widget_id,widget_type);
			
			if(widget_type == "" && typeof this.dashboards[grid_id] != 'undefined' && typeof this.dashboards[grid_id]['widgets'] != 'undefined' && typeof this.dashboards[grid_id]['widgets'][widget_id] != 'undefined' && typeof this.dashboards[grid_id]['widgets'][widget_id]['type'] == 'string'){
				widget_type = this.dashboards[grid_id]['widgets'][widget_id]['type'];
			}
			//console.log("- widget_type: ", widget_type);
			const template_type_class = 'extension-dashboard-widget-' + widget_type;
			//console.log("- template_type_class: ", template_type_class);
			
			let template_els = document.getElementById('extension-dashboard-templates').children;
			for(let tc = 0; tc < template_els.length; tc++){
				
				if(template_els[tc].children[0].classList.contains(template_type_class)){
					template_els[tc].classList.add('extension-dashboard-widget-modal-highlighted-template');
					template_els[tc].scrollIntoView({ behavior: "smooth", block: "center"});
				}
				else{
					template_els[tc].classList.remove('extension-dashboard-widget-modal-highlighted-template');
				}
				
			}
			
		}
		
	   
	    save_grid(grid_id=null, content=false, full=true) {
			//console.log("in save_grid");
			
			if(grid_id== null){
				grid_id = this.current_grid_id;
			}
			if(typeof this.grids[grid_id] == 'undefined'){
				this.grids[grid_id] = {};
			}
			this.dashboards[grid_id]['gridstack'] = this.grids[grid_id].save(content, full);
			
            window.API.postJson(
                `/extensions/${this.id}/api/ajax`, {
                    'action': 'save',
					'dashboards':this.dashboards
                }
            ).then((body) => {
                if (this.debug) {
					console.log("Dashboard: saved dashboards to backend");
				}
			
            }).catch((e) => {
                if (this.debug) {
					console.error("Dashboard: caught error saving dashboards to backend: ", e);
				}
            });
			
			this.connect_websockets();
			
	    }


		connect_websockets(){
			if(typeof this.dashboards[this.current_grid_id] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'] != 'undefined'){
				//console.log("widgets data for this grid_id: ", this.dashboards[this.current_grid_id]['widgets']);
				
				let currently_relevant_thing_ids = [];
				
				class WebSocketClient {
				  constructor(url, options = {}) {
				    this.url = url;
				    this.options = {
				      reconnectInterval: 1000,
				      maxReconnectAttempts: 50,
				      heartbeatInterval: 30000,
				      ...options,
				    };
				    this.reconnectAttempts = 0;
				    this.messageQueue = [];
				    this.eventHandlers = {};
				    this.isConnected = false;

				    this.connect();
				  }

				  connect() {
				    //console.log(`Connecting to ${this.url}...`);

				    try {
				      this.ws = new WebSocket(this.url);
				      this.setupEventHandlers();
				    } catch (error) {
				      console.error('dashboard: failed to create WebSocket:', error);
				      this.scheduleReconnect();
				    }
				  }

				  setupEventHandlers() {
				    this.ws.onopen = (event) => {
				      //console.log('WebSocket connected');
				      this.isConnected = true;
				      this.reconnectAttempts = 0;

				      // Send any queued messages
				      while (this.messageQueue.length > 0) {
				        const message = this.messageQueue.shift();
				        this.send(message);
				      }

				      // Start heartbeat
				      //this.startHeartbeat();

				      // Trigger custom open handlers
				      this.trigger('open', event);
				    };

				    this.ws.onmessage = (event) => {
				      //console.log('Websocket message received:', event.data);

				      // Try to parse JSON messages
				      let data = event.data;
				      try {
				        data = JSON.parse(event.data);
				      } catch (e) {
				        // Not JSON, use as-is
				      }

				      // Handle ping/pong for heartbeat
				      if (data.type === 'pong') {
				        this.lastPong = Date.now();
				        return;
				      }

				      // Trigger custom message handlers
				      this.trigger('message', data);

				      // Trigger typed message handlers
				      if (data.type) {
				        this.trigger(data.type, data);
				      }
				    };

				    this.ws.onerror = (error) => {
				      console.error('dashboard: WebSocket error:', error);
				      this.trigger('error', error);
				    };

				    this.ws.onclose = (event) => {
				      console.log(`dashboard: WebSocket closed: ${event.code} - ${event.reason}`);
				      this.isConnected = false;
				      this.stopHeartbeat();

				      // Trigger custom close handlers
				      this.trigger('close', event);

				      // Attempt to reconnect if not a normal closure
				      if (event.code !== 1000 && event.code !== 1001) {
				        this.scheduleReconnect();
				      }
				    };
				  }

				  send(message) {
				    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				      const data =
				        typeof message === 'object' ? JSON.stringify(message) : message;
				      this.ws.send(data);
				    } else {
				      // Queue message if not connected
				      console.error('dashboard: WebSocket not connected, queuing message');
				      this.messageQueue.push(message);
				    }
				  }

				  startHeartbeat() {
				    this.stopHeartbeat();
				    this.heartbeatTimer = setInterval(() => {
				      if (this.ws.readyState === WebSocket.OPEN) {
				        this.send({ type: 'ping', timestamp: Date.now() });

				        // Check for pong timeout
				        setTimeout(() => {
				          const timeSinceLastPong = Date.now() - (this.lastPong || 0);
				          if (timeSinceLastPong > this.options.heartbeatInterval * 2) {
				            //console.log('Dashboard: Heartbeat timeout, reconnecting...');
				            this.ws.close();
				          }
				        }, 5000);
				      }
				    }, this.options.heartbeatInterval);
				  }

				  stopHeartbeat() {
				    if (this.heartbeatTimer) {
				      clearInterval(this.heartbeatTimer);
				      this.heartbeatTimer = null;
				    }
				  }

				  scheduleReconnect() {
				    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
				      console.error('Dashboard: wesocket max reconnection attempts reached');
				      this.trigger('maxReconnectAttemptsReached');
				      return;
				    }

				    this.reconnectAttempts++;
				    const delay =
				      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
					  console.warn(`Dashboard: websocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

				    setTimeout(() => {
				      this.connect();
				    }, delay);
				  }

				  on(event, handler) {
				    if (!this.eventHandlers[event]) {
				      this.eventHandlers[event] = [];
				    }
				    this.eventHandlers[event].push(handler);
				  }

				  off(event, handler) {
				    if (this.eventHandlers[event]) {
				      this.eventHandlers[event] = this.eventHandlers[event].filter(
				        (h) => h !== handler
				      );
				    }
				  }

				  trigger(event, data) {
				    if (this.eventHandlers[event]) {
				      this.eventHandlers[event].forEach((handler) => {
				        try {
				          handler(data);
				        } catch (error) {
				          console.error(`Dashboard: Error in ${event} handler:`, error);
				        }
				      });
				    }
				  }

				  close() {
				    this.reconnectAttempts = this.options.maxReconnectAttempts;
				    this.stopHeartbeat();
				    if (this.ws) {
				      this.ws.close(1000, 'Dashboard: Client closing connection');
				    }
				  }
				}
				
				
				for (const [widget_id, details] of Object.entries( this.dashboards[this.current_grid_id]['widgets'] )) {
					//console.log("widget_id: ", widget_id);
					
					if(details && typeof details['needs'] != 'undefined' && typeof details['needs']['update'] != 'undefined'){
						
						const needs_update = details['needs']['update'];
						for (const [what_property_is_needed, needs_update_details] of Object.entries( needs_update )) {
							//console.log("what_property_is_needed: ", what_property_is_needed);
							//console.log("- needs_update_details: ", needs_update_details);
							
							if(typeof needs_update_details['thing_id'] == 'string' && typeof needs_update_details['property_id'] == 'string'){
								
								const thing_id = needs_update_details['thing_id'];
								const property_id = needs_update_details['property_id'];
								
								currently_relevant_thing_ids.push(thing_id);
								
								if(typeof this.websockets_lookup[thing_id] == ['undefined']){
									this.websockets_lookup[thing_id] = [];
								}
								if(this.websockets_lookup[thing_id].indexOf(property_id) == -1){
									this.websockets_lookup[thing_id].push(property_id);
								}
								
								if(typeof this.websockets[thing_id] == ['undefined']){
									
									let port = 8080;
									if (location.protocol == 'https:') {
										port = 443;
									}
					
									const thing_websocket_url = 'ws://' + window.location.hostname + ':' + port + '/things/' + thing_id + '?jwt=' + window.API.jwt; // /properties/temperature
									//console.log("generate_widget_content: new thing_websocket_url: ", thing_websocket_url);
					
									this.websockets[ thing_id ] = new WebSocketClient(thing_websocket_url);
					
									const client = this.websockets[ thing_id ];
									//console.log("new client: ", client);
					
									client.on('open', () => {
										if(this.debug){
											console.log('dashboard debug: a new websocket is connected and ready');
										}
									});

									client.on('message', (data) => {
										//console.log('Received:', data);
										
										if(typeof this.websockets_lookup[thing_id] != 'undefined'){
											//console.log("in theory these properties could be updated in the dashboard: ", this.websockets_lookup[thing_id]);
										}
										
										if(typeof data['id'] == 'string' && data['id'] == thing_id){
											//console.log("-- as expected, received a websocket message for this thing: ", thing_id);
											if(typeof data['messageType'] == 'string' && data['messageType'] == 'propertyStatus'){
												//console.log(" -- the websocket message contains a propertyStatus");
												if(typeof data['data'] != 'undefined'){
													for (const [property_id, property_value] of Object.entries( data['data'] )) {
														if(this.websockets_lookup[ data['id'] ] != 'undefined'){
															if(this.websockets_lookup[ data['id'] ].indexOf(property_id) != -1){
																//console.log("  -- OK, this property is represented on the dashboard.  property_id, property_value: ", property_id, property_value);
																//console.log("   -- this.view: ", this.view);
																if(this.view){
																	let elements_to_update = this.view.querySelectorAll('[data-extension-dashboard-update-thing-combo="' + thing_id + '-' + property_id + '"]');
																	
																	for(let eu = 0; eu < elements_to_update.length; eu++){
																		const el_to_update = elements_to_update[eu];
																		//console.log("\nel_to_update: ", el_to_update);
																		if(el_to_update.tagName == 'INPUT' || el_to_update.tagName == 'SELECT'){
																			let input_type = el_to_update.getAttribute('type');
																			//console.log("INPUT el. input_type: ", input_type);
																			if(typeof input_type == 'string'){
																				if(input_type == 'checkbox' && typeof property_value == 'boolean'){
																					//console.log("OK, setting checkbox to boolean value: ", property_value);
																					el_to_update.checked = property_value;
																				}
																				else if(input_type == 'range' || input_type == 'number'){
																					//console.log("OK, setting range or number input to (hopefully) a number value: ", property_value);
																					el_to_update.value = parseInt(property_value);
																				}
																				else{
																					//console.log("OK, setting an input element's value to: ", property_value);
																					el_to_update.value = property_value;
																				}
																			}
																			else{
																				//console.log("Likely setting a SELECT element's value to: ", property_value);
																				el_to_update.value = property_value;
																			}
																		}
																		else{
																			//console.log("Attempting to set the element's textContent to value: ", property_value);
																			el_to_update.textContent = property_value;
																		}
																	}
																	
																	//console.log("    -- elements_to_update: ", elements_to_update);
																}
															}
															else{
																//console.log("  -- this property update is NOT relevant for the dashboard.  property_id, property_value: ", property_id, property_value);
															}
														}
													}
												}
											}
										}
										
									});

									client.on('error', (error) => {
										console.error('Dashboard: websocket connection error:', error);
										setTimeout(() => {
											client.scheduleReconnect();
										},2000);
									});

									client.on('close', (event) => {
									  console.log('Dashboard: websocket connection closed:', event.code, event.reason);
									  if(event.code != 1000){
										  console.error("Dashboard: websocket client close seems unexpected. Will attempt to re-open it in a few seconds");
										  setTimeout(() => {
											  client.scheduleReconnect();
										  },5000 + (Math.floor(Math.random() * 1000)));
									  }
									  
		  
									});
								}
							}
							
						}
						
						
					}
					
				}
				
				// Disconnect all the websockets that are no longer relevant (every thing_id from the lookup table that is not in the current grid_id)
				for (const [websocket_thing_id, websocket_client] of Object.entries( this.websockets )) {
					if(currently_relevant_thing_ids.indexOf(websocket_thing_id) == -1){
						//console.log("open websockets is no longer needed for this thing_id: ", websocket_thing_id);
						if(websocket_client){
							websocket_client.close();
							setTimeout(() => {
								delete this.websockets[websocket_thing_id];
								//console.log("closed and deleted websocket client for ", websocket_thing_id);
							},100);
						}
					}
				}
				
				//console.log("connect_websockets: this.websockets is now: ", this.websockets);
				
			}
		}







		generate_widget_content(grid_id=null, widget_id=null, widget_type=null){
			//console.log("in generate_widget_content");
			
			if(typeof grid_id != 'string' || typeof widget_id != 'string'){
				console.error("dashboard: generate_widget_content: no valid grid_id and/or widget_id provided: ", grid_id, widget_id);
				return
			}
			
			if(typeof this.dashboards[grid_id] == 'undefined'){
				this.dashboards[grid_id] = {};
			}
			if(typeof this.dashboards[grid_id]['widgets'] == 'undefined'){
				this.dashboards[grid_id]['widgets'] = {};
			}
			if(typeof this.dashboards[grid_id]['widgets'][widget_id] == 'undefined'){
				this.dashboards[grid_id]['widgets'][widget_id] = {};
			}
			
			//console.log("generate_widget_content: dashboards: all widget data: ", typeof this.dashboards[grid_id]['widgets'][widget_id]);
			
			if(typeof widget_type == 'string'){
				this.dashboards[grid_id]['widgets'][widget_id]['type'] = widget_type;
			}
			else if(typeof widget_type != 'string' && typeof this.dashboards[grid_id]['widgets'][widget_id]['type'] == 'string'){
				widget_type = this.dashboards[grid_id]['widgets'][widget_id]['type'];
			}
			
			if(typeof widget_type != 'string'){
				console.error("dashboard: generate_widget_content: no widget_type set yet");
			}
			
			let widget_icon = null;
			if(typeof this.dashboards[grid_id]['widgets'][widget_id]['icon'] == 'string'){
				widget_icon = this.dashboards[grid_id]['widgets'][widget_id]['icon'];
			}
			
			// This dictionary will be filled based on the html contente of the template, and then used to generate the template's UI in the widget edit modal
			let needs = {};
			if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'] != 'undefined'){
				needs = this.dashboards[grid_id]['widgets'][widget_id]['needs'];
				//console.log("generate_widget_content: needs beforehand: ", needs);
			}
			
			
			const target_widget_el = document.getElementById('extension-dashboard-' + grid_id + '-' + widget_id);
			if(target_widget_el){
				
				const widget_content_el = target_widget_el.querySelector('.grid-stack-item-content');
				
				if(widget_content_el){
					
					widget_content_el.innerHTML = '';
			
					// Create a widget template clone
					let clone = null;
					if(typeof widget_type == 'string'){
						const template = document.querySelector('[data-template-name="' + widget_type + '"]');
						if(template){
				
							clone = template.cloneNode(true);
							clone.removeAttribute('id');
							
							if(clone){
								//console.log("created clone");
								widget_content_el.appendChild(clone);
							}
							
							
							let child_els = clone.querySelectorAll('*');
				
							let spotted_thing_title = null;
				
							for(let ix = 0; ix < child_els.length; ix++){
					
								// Modify the clone so that it has unique ID's
								const attributes_to_change = ['id','name','for'];
								for(let ac = 0; ac < attributes_to_change.length; ac++){
									let attribute_value = child_els[ix].getAttribute(attributes_to_change[ac]);
									if(typeof attribute_value == 'string' && attribute_value.indexOf('changeme') != -1){
										const unique_id = grid_id + '-' + widget_id; //+ '-' + thing_id + '-' + property_id;
										attribute_value = attribute_value.replaceAll('changeme',unique_id);
										child_els[ix].setAttribute(attributes_to_change[ac],attribute_value);
									}
								}
					
								// Find out which part of the template will need to be fed with live thing property values, 
								// and if possible, adjust the clone to that it will be updated if a property change is detected
								const classes_string = child_els[ix].getAttribute('class');
								if(typeof classes_string == 'string'){
									let classes = classes_string.split(" ");
									for(let c = 0; c < classes.length; c++){
										const class_name = classes[c];
							
										if(class_name.indexOf('-needs-update') != -1){
								
											let what_property_is_needed = class_name.replaceAll('-needs-update','');
											what_property_is_needed = what_property_is_needed.replaceAll('extension-dashboard-widget-','');
											//console.log("what_property_is_needed: ", what_property_is_needed);
								
											if(typeof needs['update'] == 'undefined'){
												needs['update'] = {};
											}
											if(typeof needs['update'][what_property_is_needed] == 'undefined'){
							
												needs['update'][what_property_is_needed] = {"restrictions":{"element_tag_name":child_els[ix].tagName}};
							
												// What kind of thing property should be connected to this template's html?
												if(child_els[ix].tagName == 'INPUT'){
													const input_el_type = child_els[ix].getAttribute('type');
													if(typeof input_el_type == 'string'){
														
														// TODO: these restrictions are currently not used
														needs['update'][what_property_is_needed]['restrictions']['input_type'] = input_el_type;
												
														if (input_el_type == 'text'){
															child_els[ix].value = '';
														}
														else if(input_el_type == 'color'){
															console.warn("new: color needs update");
														}
													}
											
													const read_only = child_els[ix].getAttribute('disabled');
													//console.log("read_only? ", read_only);
													if(read_only){
														needs['update'][what_property_is_needed]['restrictions']['read_only'] = true;
													}
											
												}
												else if(child_els[ix].tagName != 'SELECT'){
													try{
														child_els[ix].textContent = '';
													}
													catch(err){
														console.error("dashboard: could not set textContent of this element: ", child_els[ix]);
													}
											
												}
										
											}
											else{
												
												const input_el_type = child_els[ix].getAttribute('type');
												if(typeof input_el_type == 'string'){
											
													if(input_el_type == 'color'){
														//console.warn("color needs update, adding color picker");
														
														const color_input_el = child_els[ix];
														
														const canvas = document.createElement('canvas');
														canvas.classList.add('extension-dashboard-widget-color-canvas');
														
														canvas.setAttribute('width','80');
														canvas.setAttribute('height','80');
														//canvas.setAttribute('style','width: 100%; height: auto; min-width:100px; min-height:100px');
												
														color_input_el.parentElement.appendChild(canvas);
												
														let ctx = canvas.getContext('2d');

														function resizeCanvas() {
														    canvas.width = canvas.clientWidth;
														    canvas.height = canvas.clientWidth;
														    // Redraw your canvas content here
															drawColorWheel();
														}
		
														window.addEventListener('resize', resizeCanvas);
														resizeCanvas(); // Initial call to set size
		  
														// Draw color wheel
														function drawColorWheel() {
														  const radius = canvas.width / 2;
														  const imageData = ctx.createImageData(canvas.width, canvas.height);

														  for (let x = 0; x < canvas.width; x++) {
														    for (let y = 0; y < canvas.height; y++) {
														      const dx = x - radius;
														      const dy = y - radius;
														      const distance = Math.sqrt(dx * dx + dy * dy);
														      const angle = Math.atan2(dy, dx);

														      if (distance <= radius) {
														        const hue = (angle + Math.PI) / (2 * Math.PI);
														        const saturation = distance / radius;
														        const rgb = hslToRgb(hue, saturation, 0.5);
														        const index = (y * canvas.width + x) * 4;
														        imageData.data[index] = rgb[0];
														        imageData.data[index + 1] = rgb[1];
														        imageData.data[index + 2] = rgb[2];
														        imageData.data[index + 3] = 255;
														      }
														    }
														  }

														  ctx.putImageData(imageData, 0, 0);
														}

														// Convert HSL to RGB
														function hslToRgb(h, s, l) {
														  let r, g, b;
														  if (s === 0) {
														    r = g = b = l;
														  } else {
														    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
														    const p = 2 * l - q;
														    r = hueToRgb(p, q, h + 1/3);
														    g = hueToRgb(p, q, h);
														    b = hueToRgb(p, q, h - 1/3);
														  }
														  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
														}

														function hueToRgb(p, q, t) {
														  if (t < 0) t += 1;
														  if (t > 1) t -= 1;
														  if (t < 1/6) return p + (q - p) * 6 * t;
														  if (t < 1/2) return q;
														  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
														  return p;
														}

														// Convert RGB to HEX
														function rgbToHex(r, g, b) {
														  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
														}

														// Pick color on canvas interaction
														function pickColor(e) {
														  const rect = canvas.getBoundingClientRect();
														  console.log("rect: ", rect);
														  const x = e.clientX - rect.left;
														  const y = e.clientY - rect.top;
														  console.log("x: ", x);
														  console.log("y: ", y);
														  ctx = canvas.getContext('2d');
														  const pixel = ctx.getImageData(x, y, 1, 1).data;
														  console.log("pixel: ", pixel);
														  const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
														  console.log("hex: ", hex);
														  color_input_el.value = hex;
														  //colorCode.textContent = `HEX: ${hex} | RGB: (${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
														}

														// Event listeners for color picking
														let isDragging = false;
														canvas.addEventListener('mousedown', (e) => {
														  isDragging = true;
														  pickColor(e);
														});
														canvas.addEventListener('mousemove', (e) => {
														  if (isDragging) pickColor(e);
														});
														canvas.addEventListener('mouseup', () => {
														  isDragging = false;
														});
														canvas.addEventListener('mouseleave', () => {
														  isDragging = false;
														});

														// Initialize color wheel
														drawColorWheel();
												
													}
												}
												
												if(typeof needs['update'][what_property_is_needed]['thing_id'] == 'string' && typeof needs['update'][what_property_is_needed]['property_id'] == 'string'){
													//console.log("nice, this part of the template it already connected to a thing-property combo");
													child_els[ix].setAttribute('data-extension-dashboard-update-thing', needs['update'][what_property_is_needed]['thing_id']);
													child_els[ix].setAttribute('data-extension-dashboard-update-property', needs['update'][what_property_is_needed]['property_id']);
													child_els[ix].setAttribute('data-extension-dashboard-update-thing-combo', needs['update'][what_property_is_needed]['thing_id'] + '-' + needs['update'][what_property_is_needed]['property_id'] );
											
											
													//console.log("adding event_listener to input child_el: ", child_els[ix])
													child_els[ix].addEventListener('change', (event) => {
														//console.log("dashboard input element changed.  event: ", event);
												
														const thing_id = event.target.getAttribute('data-extension-dashboard-update-thing');
														if(typeof thing_id == 'string'){
															const property_id = event.target.getAttribute('data-extension-dashboard-update-property');
															if(typeof property_id == 'string'){
																//console.log("nice, got the thing_id and property_id from the element's data attributes: ", thing_id, property_id);
																if(typeof this.websockets[thing_id] != 'undefined'){
																	try{
																
																		let outgoing_message = {
																			"messageType": "setProperty",
																			//"id":thing_id,
																			"data":{}
																		};
																
																		let event_target_type = event.target.getAttribute('type');
																		if(event.target.tagName == 'INPUT' && typeof event_target_type  == 'string' && event_target_type == 'checkbox'){
																			outgoing_message['data'][property_id] = event.target.checked;
																		}
																		else if(typeof event.target.value != 'undefined' && event.target.value){
																			outgoing_message['data'][property_id] = event.target.value;
																		}
																
																		//console.log("sending message over websocket.  thing_id, message: ", thing_id, outgoing_message)
																		this.websockets[thing_id].send(outgoing_message);
																
																		/*
																		// example message
																		{
																		    "messageType": "setProperty",
																		    "data": {
																		      "leftMotor": 100
																		    }
																		}
																		*/
																
																
																	}
																	catch(err){
																		console.error("dashboard: caught error trying to send message via websocket: ", err);
																	}
																}
																else{
																	console.error("dashboard: no websocket for thing_id (yet)");
																}
															}
														}
														//this.handle_user_input(event,grid_id,what_property_is_needed);
													});
											
											
												}
											}
										}
							
										// Keep track of which part of the template need to be renamed
										if(class_name.indexOf('-needs-rename') != -1){
								
											let what_string_is_needed = class_name.replaceAll('-needs-rename','');
											what_string_is_needed = what_string_is_needed.replaceAll('extension-dashboard-widget-','');
											//console.log("what_string_is_needed: ", what_string_is_needed);
								
											if(typeof needs['rename'] == 'undefined'){
												needs['rename'] = {};
											}
									
											if(typeof needs['rename'][what_string_is_needed] == 'string'){
												
												
												// LINK TO ANOTHER PAGE
												if(what_string_is_needed == 'link'){
													if(this.kiosk == true && !needs['rename'][what_string_is_needed].startsWith('/')){
														console.warn("cannot open external link on the kiosk: ", needs['rename'][what_string_is_needed]);
														alert("Sorry, you cannot open an external link on the Candle Controller's display");
													}
													else{
														child_els[ix].classList.add('extension-dashboard-is-link');
														child_els[ix].addEventListener('click', () => {
															//console.log("should open link: ", needs['rename'][what_string_is_needed]);
															if(needs['rename'][what_string_is_needed].startsWith('/')){
																const local_link_to_open = window.location.origin + needs['rename'][what_string_is_needed];
																//console.log("opening local link: ", local_link_to_open);
																window.location.href = local_link_to_open;
															}
															else{
																//console.log("opening external link: ", needs['rename'][what_string_is_needed]);
																var link = document.createElement("a");
															    link.href = needs['rename'][what_string_is_needed];
															    link.target = "_blank";
															    link.click();
															}
														})
													}
													
												}else{
													child_els[ix].textContent = needs['rename'][what_string_is_needed];
												}
												
											}
											else{
												child_els[ix].textContent = '';
												needs['rename'][what_string_is_needed] = null;
											}
										}
								
								
										// Keep track of which part of the template would like an icon
										if(class_name.indexOf('-needs-icon') != -1){
								
											let what_icon_is_needed = class_name.replaceAll('-needs-icon','');
											what_icon_is_needed = what_icon_is_needed.replaceAll('extension-dashboard-widget-','');
											//console.log("what_icon_is_needed: ", what_icon_is_needed);
								
											if(typeof needs['icon'] == 'undefined'){
												needs['icon'] = {};
											}
									
											if(typeof needs['icon'][what_icon_is_needed] == 'string' && needs['icon'][what_icon_is_needed].endsWith('.svg')){
												if(child_els[ix].tagName == 'img'){
													child_els[ix].src = '/extensions/dashboard/icons/' + needs['icon'][what_icon_is_needed];
												}
												else{
													child_els[ix].style.backgroundImage="url(/extensions/dashboard/icons" + needs['icon'][what_icon_is_needed] + ")";
												}
											}
											else{
												//child_els[ix].textContent = '';
												needs['icon'][what_icon_is_needed] = null;
											}
										}
										
										
										
										
										// LOG VISUALIZATION
										
										if(class_name.indexOf('-needs-log') != -1){
								
											let what_log_is_needed = class_name.replaceAll('-needs-log','');
											what_log_is_needed = what_log_is_needed.replaceAll('extension-dashboard-widget-','');
											//console.log("what_log_is_needed: ", what_log_is_needed);
								
											if(typeof needs['log'] == 'undefined'){
												needs['log'] = {};
											}
											
											if(typeof needs['log'][what_log_is_needed] != 'undefined' && typeof needs['log'][what_log_is_needed]['log_id'] != 'undefined' && typeof needs['log'][what_log_is_needed]['thing_id'] == 'string' && typeof needs['log'][what_log_is_needed]['property_id'] == 'string'){
												//console.log("OK, this part of the template it already connected to a LOG thing-property combo");
												child_els[ix].setAttribute('data-extension-dashboard-log-id', needs['log'][what_log_is_needed]['log_id']);
												child_els[ix].setAttribute('data-extension-dashboard-log-thing', needs['log'][what_log_is_needed]['thing_id']);
												child_els[ix].setAttribute('data-extension-dashboard-log-property', needs['log'][what_log_is_needed]['property_id']);
												//child_els[ix].setAttribute('data-extension-dashboard-log-thing-combo', needs['update'][what_property_is_needed]['thing_id'] + '-' + needs['update'][what_property_is_needed]['property_id'] );
												if(this.current_logs.indexOf(needs['log'][what_log_is_needed]['log_id']) == -1){
													this.current_logs.push(needs['log'][what_log_is_needed]['log_id']);
													//console.log("this.current_logs is now: ", this.current_logs);
												}
												else{
													console.warn("strange, that log ID was already in the list of current logs: ", needs['log'][what_log_is_needed]['log_id'], this.current_logs);
												}
												
											}
											else{
												//console.log("No log data in this widget's needs yet");
												//child_els[ix].textContent = '';
												needs['log'][what_log_is_needed] = {};
											}
										}
										
									}
								}
					
							}
							//console.log("modified clone: ", clone);
						}
					}

					
					let configure_widget_button_el = document.createElement('div');
					configure_widget_button_el.classList.add('extension-dashboard-show-if-editing');
					configure_widget_button_el.classList.add('extension-dashboard-configure-widget-button');
					configure_widget_button_el.textContent = " ";
					configure_widget_button_el.addEventListener('click',() => {
						//console.log("clicked on configure widget button");
						this.current_widget_id = widget_id;
						this.show_modal(grid_id,widget_id);
					})
					widget_content_el.appendChild(configure_widget_button_el);
					
				}
				else{
					console.error("dashboard: found widget element, but could not find widget content element: " + grid_id + '-' + widget_id);
				}
			}
			else{
				console.error("dashboard: could not find widget element: " + grid_id + '-' + widget_id)
			}
			
			
			if(this.debug){
				console.warn("\nDashboard debug: widget NEEDS: ", needs);
			}
			
			this.dashboards[grid_id]['widgets'][widget_id]['needs'] = needs;
			//console.warn("\nthis.dashboards: ", this.dashboards);
			
			// Quickly close and immediately re-open the modal so that the settings are generated
			// TODO: develop a better way to do this
			if(this.modal_el.open){
				this.modal_el.close();
				this.show_modal(this.current_grid_id,this.current_widget_id);
			}
			
		}




		


		//
		//  MODAL
		//
        
		async show_modal(grid_id=null,widget_id=null){
			//console.log("in show_modal:  grid_id,widget_id: ", grid_id,widget_id);
			
			if(grid_id == null){
				grid_id = this.current_grid_id;
			}
			if(typeof widget_id != 'string'){
				console.error("dashboard: show_modal: no valid widget_id provided: ", widget_id);
				return
			}
			
			
			
			const modal_el = document.getElementById('extension-dashboard-widget-modal');
			if(modal_el){
				
				if(this.created_template_color_wheel == false){
					this.created_template_color_wheel = true;
				}
				
				if(typeof this.dashboards[grid_id] != 'undefined'){
					if(typeof this.dashboards[grid_id]['widgets'] == 'undefined'){
						this.dashboards[grid_id]['widgets'] = {};
					}
					if(typeof this.dashboards[grid_id]['widgets'][widget_id] == 'undefined'){
						this.dashboards[grid_id]['widgets'][widget_id] = {};
					}
					
					let modal_title = '';
					
					let thing_id = null;
					let property_id = null;
					
					if(typeof this.dashboards[grid_id]['widgets'][widget_id] == 'undefined'){
						this.dashboards[grid_id]['widgets'][widget_id] = {};
					}
					
					if(modal_title == ''){
						modal_title = 'Widget';
					}
					this.modal_el.querySelector('#extension-dashboard-widget-modal-title').textContent = modal_title;
					
					
					this.set_highlighted_modal_template(grid_id,widget_id);
					
					
					// GENERATE SETTINGS UI FOR THE WIDGET
					
					const modal_ui_container_el = this.modal_el.querySelector('#extension-dashboard-widget-modal-ui-container');
					if(modal_ui_container_el){
						
						modal_ui_container_el.innerHTML = '';
						
						let needs = {};
						if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'] != 'undefined'){
							needs = this.dashboards[grid_id]['widgets'][widget_id]['needs'];
						}
						
						let widget_ui_el = document.createElement('div');
						widget_ui_el.classList.add('extension-dashboard-widget-ui');
				
						if(typeof needs['rename'] != 'undefined' || typeof needs['update'] != 'undefined' || typeof needs['icon'] != 'undefined'){
							let widget_ui_title_el = document.createElement('h3');
							let widget_settings_title = 'Settings';
							if(typeof this.dashboards[grid_id]['widgets'][widget_id]['type'] == 'string'){
								widget_settings_title = widget_settings_title + ' for ' + this.dashboards[grid_id]['widgets'][widget_id]['type'].replaceAll('_',' ') + ' widget';
							}
							widget_ui_title_el.textContent = widget_settings_title;
							modal_ui_container_el.appendChild(widget_ui_title_el);
						}
				
				
						if(typeof needs['rename'] != 'undefined'){
					
							let rename_container_el = document.createElement('div');
							rename_container_el.classList.add('extension-dashboard-widget-ui-rename-container');
							
							let rename_title_el = document.createElement('h4');
							if(Object.keys(needs['rename']).length == 1){
								rename_title_el.textContent = 'Widget title';
							}
							else{
								rename_title_el.textContent = 'Widget titles';
							}
							rename_container_el.appendChild(rename_title_el);
							
							for (const [what_string_is_needed, value] of Object.entries(needs['rename'])) {
								//console.log(`rename: what_string_is_needed: ${what_string_is_needed}: ${value}`);
								let rename_input_el = document.createElement('input');
								rename_input_el.setAttribute('type','text');
								rename_input_el.setAttribute('placeholder',what_string_is_needed.replaceAll('_',' '));
								if(typeof value == 'string'){
									rename_input_el.value = value;
								}
								rename_input_el.addEventListener('input', () => {
									//console.log("rename_input_el new value: ", rename_input_el.value, " for: ", what_string_is_needed);
									this.dashboards[grid_id]['widgets'][widget_id]['needs']['rename'][what_string_is_needed] = rename_input_el.value;
								})
								rename_container_el.appendChild(rename_input_el);
							}
							widget_ui_el.appendChild(rename_container_el);
							//console.log("rename: widget_ui_el: ", widget_ui_el);
						}
						
						
						if(typeof needs['icon'] != 'undefined'){
					
							let icon_container_el = document.createElement('div');
							icon_container_el.classList.add('extension-dashboard-widget-ui-icon-container');
							
							const icons_per_page = 100;
							
							widget_ui_el.appendChild(icon_container_el);
					
							for (const [what_icon_is_needed, value] of Object.entries(needs['icon'])) {
								//console.log(`what_icon_is_needed: ${what_icon_is_needed}: ${value}`);
						
								let icon_wrapper_el = document.createElement('div');
								icon_wrapper_el.classList.add('extension-dashboard-widget-ui-icon-wrapper');
								
								let what_icon_is_needed_title_el = document.createElement('h4');
								what_icon_is_needed_title_el.textContent = what_icon_is_needed.replaceAll('_',' ');
								icon_wrapper_el.appendChild(what_icon_is_needed_title_el);
								
								const icon_output_el_id = 'extension-dashboard-widget-ui-icon-output-' + what_icon_is_needed;
								let icon_output_el = document.createElement('div');
								icon_output_el.classList.add('extension-dashboard-widget-ui-icon-output');
								icon_output_el.setAttribute('id',icon_output_el_id);
								
								let selected_icon_image_el = document.createElement('img');
								selected_icon_image_el.classList.add('extension-dashboard-widget-ui-icon-output-image');
								if(typeof value == 'string' && value.endsWith('.svg')){
									selected_icon_image_el.setAttribute('src','/extensions/dashboard/icons' + value);
									icon_wrapper_el.classList.add('extension-dashboard-widget-ui-icon-has-been-selected');
								}
								selected_icon_image_el.addEventListener('click', () => {
									icon_wrapper_el.classList.remove('extension-dashboard-widget-ui-icon-has-been-selected');
								})
								
								icon_output_el.appendChild(selected_icon_image_el);
								
								//icon_output_el.textContent = what_icon_is_needed;
								icon_wrapper_el.appendChild(icon_output_el);
								
								// ICON PICKER
								// TODO: add cancel button to icon picker
								
								let icon_picker_info_el = document.createElement('span');
								icon_picker_info_el.classList.add('extension-dashboard-widget-ui-icon-picker-info');
								
								let icon_picker_container_el = document.createElement('div');
								icon_picker_container_el.classList.add('extension-dashboard-widget-ui-icon-picker-container');
								
								let icon_search_input_el = document.createElement('input');
								icon_search_input_el.setAttribute('type','search');
								icon_search_input_el.setAttribute('placeholder','Search for an icon');
								icon_search_input_el.classList.add('extension-dashboard-widget-ui-icon-picker-search');
								
								
								icon_picker_container_el.appendChild(icon_search_input_el);
								
								if(this.icon_dirs.length){
									let icon_picker_folders_container_el = document.createElement('div');
									icon_picker_folders_container_el.classList.add('extension-dashboard-widget-ui-icon-picker-folders-container');
									icon_picker_container_el.appendChild(icon_picker_folders_container_el);

									for(let fo = 0; fo < this.icon_dirs.length; fo++){
										let icon_picker_folder_button_el = document.createElement('span');
										icon_picker_folder_button_el.classList.add('extension-dashboard-widget-ui-icon-picker-folder-button');
										icon_picker_folder_button_el.textContent = this.icon_dirs[fo];
										icon_picker_folder_button_el.addEventListener('click', () => {
											filter_icons(this.icon_dirs[fo]);
										});
										icon_picker_folders_container_el.appendChild(icon_picker_folder_button_el);
									}
									icon_picker_container_el.appendChild(icon_picker_folders_container_el);
								}
								
								
								let icon_picker_images_container_el = document.createElement('div');
								icon_picker_images_container_el.classList.add('extension-dashboard-widget-ui-icon-picker-images-container');
								icon_picker_container_el.appendChild(icon_picker_images_container_el);
								
								
								// function to add icon to icon selector
								const add_icon = (icon_path) => {
									//console.log("in add_icon.  icon_path: ", icon_path);
									if(typeof icon_path == 'string' && icon_path.endsWith('.svg')){
										let icon_image_el = document.createElement('img');
										icon_image_el.classList.add('extension-dashboard-widget-ui-icon-image');
										icon_image_el.setAttribute('src', '/extensions/dashboard/icons' + icon_path);
										icon_image_el.setAttribute('loading', 'lazy');
										icon_image_el.setAttribute('alt', icon_path.replaceAll('/',' ').replaceAll('_',' ').replaceAll('-',' ').replace('.svg',''));
										
										if(icon_path == value){
											//console.log("spotted currently selected icon");
											icon_image_el.classList.add('extension-dashboard-widget-ui-icon-current-image');
										}
										
										icon_image_el.addEventListener('click', () => {
											//console.log("clicked on icon: ", icon_path);
											this.dashboards[grid_id]['widgets'][widget_id]['needs']['icon'][what_icon_is_needed] = icon_path;
											selected_icon_image_el.setAttribute('src','/extensions/dashboard/icons' + icon_path);
											icon_wrapper_el.classList.add('extension-dashboard-widget-ui-icon-has-been-selected');
											selected_icon_image_el.scrollIntoView();
										})
										
										icon_picker_images_container_el.appendChild(icon_image_el);
									}
									
								}
								
								let icon_start_index = 0;
								let icon_end_index = icons_per_page;
								
								
								const list_icons = (start_index=null) => {
									//console.log("in list_icons. provided start_index: ", start_index);
									if(start_index != null){
										icon_start_index = start_index;
									}
									//console.log("in list_icons. icon_start_index: ", icon_start_index);
									icon_picker_images_container_el.innerHTML = '';
									if(icon_start_index >= this.icon_paths.length){
										icon_start_index = 0;
										icon_end_index = icons_per_page;
									}
									else{
										icon_end_index = icon_start_index + icons_per_page;
										if(icon_end_index >= this.icon_paths.length){
											icon_end_index = this.icon_paths.length - 1;
										}
									}
									
									
									icon_picker_info_el.textContent = '' + icon_start_index + ' to ' + icon_end_index + ' of ' + this.icon_paths.length;
									
									for(let f = icon_start_index; f < icon_end_index; f++){
										add_icon(this.icon_paths[f]);
									}
								}
								
								
								// FUNCTION TO FILTER ICONS
								const filter_icons = (term) => {
									//console.log("in filter_icons. provided term: ", term);
									
									if(typeof term == 'string' && term.length){
										term = term.trim();
										icon_picker_images_container_el.innerHTML = '';
										if(term.length > 2){
											term = term.toLowerCase();
											for(let f = 0; f < this.icon_paths.length; f++){
												if(this.icon_paths[f].indexOf(term) != -1){
													add_icon(this.icon_paths[f]);
												}
											}
										}
									}
									else{
										list_icons();
									}
								}
								
								icon_search_input_el.addEventListener('input', () => {
									filter_icons(icon_search_input_el.value);
								});
								
								let icon_picker_footer_el = document.createElement('div');
								icon_picker_footer_el.classList.add('extension-dashboard-widget-ui-icon-picker-footer');
								icon_picker_footer_el.classList.add('extension-dashboard-flex-between');
								
								let icon_picker_prev_button_el = document.createElement('button');
								icon_picker_prev_button_el.classList.add('extension-dashboard-widget-ui-icon-picker-prev-button');
								icon_picker_prev_button_el.classList.add('text-button');
								icon_picker_prev_button_el.textContent = 'Previous'; // &laquo; 
								icon_picker_prev_button_el.addEventListener('click', () => {
									if(icon_start_index >= icons_per_page){
										list_icons(icon_start_index - icons_per_page);
									}
								});
								icon_picker_footer_el.appendChild(icon_picker_prev_button_el);
								
								icon_picker_footer_el.appendChild(icon_picker_info_el);
								
								let icon_picker_next_button_el = document.createElement('button');
								icon_picker_next_button_el.classList.add('extension-dashboard-widget-ui-icon-picker-next-button');
								icon_picker_next_button_el.classList.add('text-button');
								icon_picker_next_button_el.textContent = 'Next'; //  &#8249;
								icon_picker_next_button_el.addEventListener('click', () => {
									if(icon_start_index < this.icon_paths.length){
										list_icons(icon_start_index + icons_per_page);
									}
								});
								icon_picker_footer_el.appendChild(icon_picker_next_button_el);
								
								icon_picker_container_el.appendChild(icon_picker_footer_el);
								
								list_icons();
								
								icon_wrapper_el.appendChild(icon_picker_container_el);
						
								icon_container_el.appendChild(icon_wrapper_el);
							}
							
						}
						
						
				
						if(typeof needs['update'] != 'undefined'){
					
							let update_container_el = document.createElement('div');
							update_container_el.classList.add('extension-dashboard-widget-ui-update-container');
					
							widget_ui_el.appendChild(update_container_el);
					
							for (const [what_property_is_needed, value] of Object.entries(needs['update'])) {
								//console.log(`${what_property_is_needed}: ${value}`);
						
								let thing_id = null;
								if(typeof needs['update'][what_property_is_needed]['thing_id'] == 'string'){
									thing_id = needs['update'][what_property_is_needed]['thing_id'];
								}
								let property_id = null;
								if(typeof needs['update'][what_property_is_needed]['property_id'] == 'string'){
									property_id = needs['update'][what_property_is_needed]['property_id'];
								}
								// needs['update'][what_property_is_needed]['property_id']
						
								let new_thing_selector_el = await this.generate_thing_selector(grid_id,widget_id,thing_id,property_id, what_property_is_needed);
								if(new_thing_selector_el){
									//console.log("OK, NICE. Seems to have gotten a customized thing-property selector for the template");
						
									let what_property_is_needed_title_el = document.createElement('h4');
									what_property_is_needed_title_el.textContent = what_property_is_needed.replaceAll('_',' ');
									update_container_el.appendChild(what_property_is_needed_title_el);
						
									update_container_el.appendChild(new_thing_selector_el);
								}
								else{
									console.error("dashboard: show_modal: generate_thing_selector did not return a thing selector element");
								}
							}
						
						}
						
						if(typeof needs['log'] != 'undefined'){
							//console.log("generating log template ui. needs['log']: ", needs['log']);
					
							let log_container_el = document.createElement('div');
							log_container_el.classList.add('extension-dashboard-widget-ui-log-container');
					
							widget_ui_el.appendChild(log_container_el);
					
							for (const [what_log_is_needed, value] of Object.entries(needs['log'])) {
								//console.log("generating log template UI. what_log_is_needed: ", what_log_is_needed, value);
								
								if(typeof what_log_is_needed == 'string'){
									
									let thing_id = null;

									let property_id = null;
									
									if(typeof needs['log'][what_log_is_needed] != 'undefined' && needs['log'][what_log_is_needed] != null){
										if(typeof needs['log'][what_log_is_needed]['thing_id'] == 'string'){
											thing_id = needs['log'][what_log_is_needed]['thing_id'];
										}
										if(typeof needs['log'][what_log_is_needed]['property_id'] == 'string'){
											property_id = needs['log'][what_log_is_needed]['property_id'];
										}
										
										let new_log_selector_el = await this.generate_log_selector(grid_id,widget_id,thing_id,property_id, what_log_is_needed);
										if(new_log_selector_el){
											
											let what_log_is_needed_title_el = document.createElement('h4');
											what_log_is_needed_title_el.textContent = what_log_is_needed.replaceAll('_',' ');
											log_container_el.appendChild(what_log_is_needed_title_el);
						
											log_container_el.appendChild(new_log_selector_el);
										}
										else{
											console.error("dashboard: show_modal: generate_thing_selector did not return a thing selector element");
										}
									}
								}
						
							}
					
						}
						
						//if(widget_ui_el.innerHTML == ''){
						//	widget_ui_el.innerHTML = 'This widget does not have any settings';
						//}
						
						modal_ui_container_el.appendChild(widget_ui_el);
						
					}
				}
				
				modal_el.showModal();
			}
			
		}
		
		
		
		
		generate_log_selector(grid_id=null,widget_id=null,provided_thing_id=null,provided_property_id=null,what_log_is_needed=null){
			//console.log("in generate_log_selector. this.logs: ", this.logs);
			//console.log("- provided_thing_id,provided_property_id: ", provided_thing_id,provided_property_id);
			
			return new Promise((resolve, reject) => {
				
				if(grid_id == null){
		        	grid_id = this.current_grid_id;
		        }
			
				if(widget_id == null){
					console.error("dashboard: generate_thing_selector: no widget_id provided! aborting");
					reject(null);
				}
			
				//console.log("in generate_thing_selector.  grid_id,widget_id,provided_thing_id,provided_property_id,what_property_is_needed: ", grid_id,widget_id,provided_thing_id,provided_property_id,what_property_is_needed);
			
	    		// Pre populating the original item that will be clones to create new ones
	    	    this.update_logs_data()
				.then((logs) => {
					//console.log("generate_log_selector: got logs data: ", logs);
					
					let logs_select_el = document.createElement('select');
					logs_select_el.classList.add('extension-dashboard-modal-log-selector');
					
					
					for (let li = 0; li < logs.length; li++){
						//console.log("looping over log: ", logs[li]);
						
						if(typeof logs[li]['id'] != 'undefined' && typeof logs[li]['thing'] == 'string' && typeof logs[li]['property'] == 'string'){
							
							const log_id = logs[li]['id'];
							const log_thing_id = logs[li]['thing'];
							const log_property_id = logs[li]['property'];
							
							let log_option_el = document.createElement('option');
							log_option_el.setAttribute('data-log_id',log_id);
							log_option_el.setAttribute('data-thing_id',log_thing_id);
							log_option_el.setAttribute('data-property_id',log_property_id);
							log_option_el.value = log_thing_id + '--|--' + log_property_id;
							
							// TODO: get the nice thing and property title from thing data
							log_option_el.textContent = log_thing_id.replaceAll('_',' ') + ' ' + log_property_id.replaceAll('_',' ');
							
							//console.log(log_thing_id, " =?=", provided_thing_id);
							//console.log(log_property_id, " ==?==", provided_property_id);
							
							if(log_thing_id == provided_thing_id && log_property_id == provided_property_id){
								//console.log('setting log to selected: ', log_thing_id, log_property_id);
								log_option_el.setAttribute('selected','selected');
							}
			
							logs_select_el.appendChild(log_option_el);
						}
						else{
							console.error("dashboard: generate_log_selector: log data was missing valid ID, thing or property: ", logs[li]);
							//reject(null);
						}
						
					}
					
                	logs_select_el.addEventListener("change", () => {
                		//const selected_thing_id = logs_select_el.value.split("--|--")[0];
						//const selected_property_id = logs_select_el.value.split("--|--")[1];
						
						//console.log("LOG SELECT CHANGED");
						
						let selected_option_el = logs_select_el.options[logs_select_el.selectedIndex];
						//console.log("selected_option_el: ", selected_option_el);
						
						if(selected_option_el){
							
							const selected_thing_id = selected_option_el.getAttribute('data-thing_id');
							const selected_property_id = selected_option_el.getAttribute('data-property_id');
							const selected_log_id = selected_option_el.getAttribute('data-log_id');
							//console.log("log select changed.  selected_thing_id,selected_property_id,selected_log_id : ", selected_thing_id, selected_property_id, selected_log_id );
						
						
							if(typeof this.dashboards[grid_id]['widgets'] == 'undefined'){
								this.dashboards[grid_id]['widgets'] = {};
							}
							if(typeof this.dashboards[grid_id]['widgets'][widget_id] == 'undefined'){
								this.dashboards[grid_id]['widgets'][widget_id] = {};
							}
						
							if(typeof what_log_is_needed == 'string'){
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'] == 'undefined'){
									this.dashboards[grid_id]['widgets'][widget_id]['needs'] = {};
								}
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'] == 'undefined'){
									this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'] = {};
								}
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed] == 'undefined'){
									this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed] = {};
								}
							
								if(typeof selected_thing_id == 'string' && typeof selected_property_id == 'string'){
									//console.log("setting this.dashboards data for log.  grid_id, widget_id, what_log_is_needed, selected_thing_id,selected_log_id:  ", grid_id, widget_id, what_log_is_needed, selected_thing_id, selected_log_id );
									this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['thing_id'] = selected_thing_id;
									this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['property_id'] = selected_property_id;
									this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['log_id'] = selected_log_id;
									//this.dashboards[grid_id]['widgets'][widget_id]['type'] = 'log';
									
								}
								else{
									console.error("dashboard: selected_thing_id or selected_property_id was not a string: ", selected_thing_id, selected_property_id);
								}
							
							}
							else{
								console.error("dashboard: what_log_is_needed is not a string: ", what_log_is_needed);
							}
							
							//console.log("this.dashboards is now: ", this.dashboards);
							//console.log("this.dashboards needs log is now: ", this.dashboards[grid_id]['widgets'][widget_id]['needs']['log']);
						}
						else{
							console.error("dashboard: could not get selection option element from log select element?");
						}
						
                	});
					
					resolve(logs_select_el);
					
				})
				.catch((err) => {
					console.error("dashboard: generate_log_selector: caught error calling update_logs_data: ", err);
					reject(null);
				})
			})
		}
		
		
		
		
		
		generate_thing_selector(grid_id=null,widget_id=null,provided_thing_id=null,provided_property_id=null,what_property_is_needed=null){
	        
			return new Promise((resolve, reject) => {
				
				if(grid_id == null){
		        	grid_id = this.current_grid_id;
		        }
			
				if(widget_id == null){
					console.error("dashboard: generate_thing_selector: no widget_id provided! aborting");
					reject(null);
				}
			
				//console.log("in generate_thing_selector.  grid_id,widget_id,provided_thing_id,provided_property_id,what_property_is_needed: ", grid_id,widget_id,provided_thing_id,provided_property_id,what_property_is_needed);
			
	    		// Pre populating the original item that will be clones to create new ones
	    	    this.update_things_data()
				.then((things) => {
		
					//console.log("generate_thing_selector: things from update_things_data: ", things);
		
					let thing_select_container_el = document.createElement('div');
					thing_select_container_el.classList.add('extension-dashboard-modal-thing-selector-container');
				
					let thing_select_thing_container_el = document.createElement('div');
					thing_select_thing_container_el.classList.add('extension-dashboard-modal-thing-selector-thing-container');
					let thing_select_el = document.createElement('select');
					thing_select_el.classList.add('extension-dashboard-modal-thing-select');
					
					let thing_select_property_container_el = document.createElement('div');
					thing_select_property_container_el.classList.add('extension-dashboard-modal-thing-selector-property-container');
		
	    			// pre-populate the hidden 'new' item with all the thing names
	    			var thing_ids = [];
	    			var thing_titles = [];
		
	    			for (let key in things){
						//console.log("generate_thing_selector:  key: ", key);
					
	    				var thing_title = 'unknown';
	    				if( things[key].hasOwnProperty('title') ){
	    					thing_title = things[key]['title'];
	    				}
	    				else if( things[key].hasOwnProperty('label') ){
	    					thing_title = things[key]['label'];
	    				}
	    				else if( things[key].hasOwnProperty('name') ){
	    					thing_title = things[key]['name'];
	    				}
			
	    				//console.log("thing_title: ", thing_title);
	    				try{
	    					if (thing_title.startsWith('highlights-') ){
	    						// Skip highlight items
	    						continue;
	    					}
				
	    				}
	    				catch(e){
	                        //console.log("error in creating list of things for highlights: " + e);
	                    }
		
						if(typeof things[key]['href'] == 'string'){
		    				var thing_id = things[key]['href'].substr(things[key]['href'].lastIndexOf('/') + 1);
		    				try{
		    					if (thing_id.startsWith('highlights-') ){
		    						// Skip items that are already highlight clones themselves.
		    						//console.log(thing_id + " starts with highlight-, so skipping.");
		    						continue;
		    					}
				
		    				}
		    				catch(e){
		                        console.log("error in creating list of things for item: " + e);
		                    }
					
		    				thing_ids.push( thing_id );
			
							//console.log("thing_id: ", thing_id);
			
							if(provided_thing_id == null){
								// TODO: could remember the last selected thing_id, and use that the next time?
								provided_thing_id = thing_id; // Set the first thing_id we encounter as the one to be selected
							}
				
							let thing_option_el = document.createElement('option');
							thing_option_el.value = thing_id;
							thing_option_el.textContent = thing_title;
				
							if(thing_id == provided_thing_id){
								//console.log('setting thing to selected: ', thing_id, thing_title)
								thing_option_el.setAttribute('selected','selected');
						
								// if this is the selected thing, generate the initial properties select too
						
								const property_select_el = this.generate_property_select(grid_id, widget_id,provided_thing_id,provided_property_id);
								if(property_select_el){
									thing_select_property_container_el.innerHTML = '';
									thing_select_property_container_el.appendChild(property_select_el);
								}
								else{
									console.error("dashboard: thing_select_property_container_el did not return a select element");
									thing_select_property_container_el.innerHTML = '?';
								}
						
							}
					
							thing_select_el.appendChild(thing_option_el);
						}
						else{
							console.error("dashboard: thing data has no href attribute?");
						}
	    				
	    			}
		
                	thing_select_el.addEventListener("change", () => {
                		const change_to_thing_id = thing_select_el.value;
						//console.log("change_to_thing_id: ", change_to_thing_id);
						
						const property_select_el = this.generate_property_select(grid_id,widget_id,change_to_thing_id,null,what_property_is_needed);
						if(property_select_el){
							thing_select_property_container_el.innerHTML = '';
							thing_select_property_container_el.appendChild(property_select_el);
						}
						else{
							console.error("dashboard: modal thing selector on change: generate_property_select did not return a select element");
							thing_select_property_container_el.innerHTML = '?';
						}
						
                	});
					
					thing_select_thing_container_el.appendChild(thing_select_el);	
				
					thing_select_container_el.appendChild(thing_select_thing_container_el);
					thing_select_container_el.appendChild(thing_select_property_container_el);
			
					resolve(thing_select_container_el);
	    	    })
				.catch((err) => {
					console.error("dashboard: generate_thing_selector: caught error calling update_things_data: ", err);
					reject(null);
				})
				
			});
			
		}
		
		
		
		generate_property_select(grid_id=null, widget_id=null, provided_thing_id=null, provided_property_id=null, what_property_is_needed=null){
			
			if(typeof grid_id != 'string'){
				console.error("dashboard: generate_property_select: no grid_id provided");
			}
			if(typeof widget_id != 'string'){
				console.error("dashboard: generate_property_select: no widget_id provided");
			}
			
			//console.log("generate_property_select:  provided_thing_id, provided_property_id, what_property_is_needed: ", provided_thing_id, provided_property_id, what_property_is_needed);
			try{
				let found_thing = false;
			
				if(
					this.all_things && 
					typeof provided_thing_id == 'string' && 
					provided_thing_id.length
				
				){
				
					const things = this.all_things;
					//console.log("generate_property_select: looping over all things: ", things);
					
					for (let key in things){
						
						if(typeof things[key]['href'] == 'string'){
							var thing_id = things[key]['href'].substr(things[key]['href'].lastIndexOf('/') + 1);
							
							if(thing_id == provided_thing_id){
								
								found_thing = true;
								const thing = things[key];
								//console.log("generate_property_select: thing: ", thing);
								
			    				var thing_title = null;
			    				if( things[key].hasOwnProperty('title') ){
			    					thing_title = things[key]['title'];
			    				}
			    				else if( things[key].hasOwnProperty('label') ){
			    					thing_title = things[key]['label'];
			    				}
			    				else if( things[key].hasOwnProperty('name') ){
			    					thing_title = things[key]['name'];
			    				}
						
								if(typeof things[key]['properties'] != 'undefined' && Object.keys(things[key]['properties']).length){
									
									let property_select_el = document.createElement('select');
									let properties = things[key]['properties'];
									
									if(provided_property_id == null && Object.keys(properties).indexOf('brightness') != -1){
										provided_property_id = 'brightness';
									}
									else if(provided_property_id == null && Object.keys(properties).indexOf('state') != -1){
										provided_property_id = 'state';
									}
				
									for (let prop in properties){
										
										const property_id = prop;
										
										var property_title = null;
										if( properties[prop].hasOwnProperty('title') ){
											property_title = properties[prop]['title'];
										}
										else if( properties[prop].hasOwnProperty('label') ){
											property_title = properties[prop]['label'];
										}
										
										if(typeof property_title == 'string'){
						
											let property_option_el = document.createElement('option');
											property_option_el.value = property_id;
											property_option_el.textContent = property_title;
						
											if(property_id == provided_property_id){
												//console.log('setting select property option to selected: ', property_id, property_title)
												property_option_el.setAttribute('selected','selected');
											}
											property_select_el.appendChild(property_option_el);
											
										}
            
									}
				
				
									property_select_el.addEventListener("change", () => {
					
										const property_id = property_select_el.value;
					
										if(typeof property_id == 'string' && typeof properties[property_id] != 'undefined'){
											
											var property_title = null;
											if( properties[property_id].hasOwnProperty('title') ){
												property_title = properties[property_id]['title'];
											}
											else if( properties[property_id].hasOwnProperty('label') ){
												property_title = properties[property_id]['label'];
											}
											
											if(typeof this.dashboards[grid_id]['widgets'] == 'undefined'){
												this.dashboards[grid_id]['widgets'] = {};
											}
											if(typeof this.dashboards[grid_id]['widgets'][widget_id] == 'undefined'){
												this.dashboards[grid_id]['widgets'][widget_id] = {};
											}
											
											if(typeof what_property_is_needed == 'string'){
												if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'] == 'undefined'){
													this.dashboards[grid_id]['widgets'][widget_id]['needs'] = {};
												}
												if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'] == 'undefined'){
													this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'] = {};
												}
												if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'][what_property_is_needed] == 'undefined'){
													this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'][what_property_is_needed] = {};
												}
												
												this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'][what_property_is_needed]['thing_id'] = thing_id;
												this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'][what_property_is_needed]['thing_title'] = thing_title;
												this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'][what_property_is_needed]['property_id'] = property_id;
												this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'][what_property_is_needed]['property_title'] = property_title;
												this.dashboards[grid_id]['widgets'][widget_id]['needs']['update'][what_property_is_needed]['property_details'] = properties[property_id];
											}
											
											
										}
					
									});
							
									var fake_change_event = new Event('change');
									property_select_el.dispatchEvent(fake_change_event);
							
									return property_select_el;
							
								}
						
							}
						}
						else{
							console.error("dashboard: no href attribute in thing data?", things[key]);
						}
						
					}	
				
				}
			}
			catch(err){
				console.error("dashboard: caught error in generate_property_select: ", err);
			}
			
			if(this.debug){
				console.error("dashboard: generate_property_select: fell through.  grid_id, widget_id, provided_thing_id: ", grid_id, widget_id, provided_thing_id);
			}
			
			return null;
			
		}
		
		
		
		
		
		
		
		render_logs(log_to_render=null){
			//console.log("in render_logs.  log_to_render: ", log_to_render);
			if(this.current_logs.length){
				//console.log("render_logs: there are logs to redraw: ", this.current_logs);
				
				if(log_to_render == null || (typeof log_to_render == 'string' && this.logs_data[log_to_render] == 'undefined')){
		            window.API.postJson(
		                `/extensions/${this.id}/api/ajax`, {
		                    'action': 'get_logs_data',
		                    'log_ids': this.current_logs
		                }
		            ).then((body) => {
		                if(this.debug){
							//console.log('render_logs: get_logs_data response: ', body);
						}
					
						if(body.state === true && (body['raw_numeric_log_data'].length || body['raw_boolean_log_data'].length)){
							//console.log("OK, seem to have gotted some log data");
						
							this.logs_data = {};
						
							const data_sources = ['raw_boolean_log_data','raw_numeric_log_data'];
							for(let ds = 0; ds < data_sources.length; ds++){
								const source = data_sources[ds];
							
								var lineStart = 0;
								var lineEnd = body[source].indexOf("\n");

								while (lineEnd >= 0) {
								    var line = body[source].substring(lineStart, lineEnd); // Extract the line
							    
									const line_data = line.split('|');
									if(line_data.length == 3){
										if(typeof this.logs_data[ '' + line_data[0] ] == 'undefined'){
											this.logs_data[ '' + line_data[0] ] = [];
										}
										this.logs_data[ '' + line_data[0] ].push({"d":new Date(parseInt(line_data[1])), "v":parseFloat(line_data[2])})
									}
									
								    lineStart = lineEnd + 1;
								    lineEnd = body[source].indexOf("\n", lineStart);
								}
							
							}
						
							for (const [log_id, log_data] of Object.entries(this.logs_data)) {
						
								if(typeof log_to_render == 'string' && log_id != log_to_render){
									//console.log("render_logs: skipping a render because specific log_to_render was set: ", log_to_render);
									continue
								}
						
								for (let lo = 0; lo < this.logs.length; lo++){
									if(this.logs[lo]['id'] == log_id){
										//console.log("found the log data match");
									
										// extension-dashboard-grid7-widget0
										let log_viz_el = document.querySelector('#extension-dashboard-' + this.current_grid_id + ' div[data-extension-dashboard-log-id="' + log_id + '"]');
										if(log_viz_el){
										
											let closest_hint_el = log_viz_el.closest('[gs-h="2"],[gs-h="3"],[gs-h="4"]');
											//console.log("closest_hint_el: ", closest_hint_el);
											
											let svg_padding = 0;
											if(closest_hint_el){
												svg_padding = 40;
											}
											//console.log("Found the element that the dataviz should be placed into: ", log_viz_el);
										
											//console.log("the relevant  log_data: ", log_data);
										
											const real_rect = log_viz_el.getBoundingClientRect(log_viz_el);
											//console.log("log_viz_el real_rect: ", real_rect);
										
											const rect = {
													"width":Math.floor(real_rect.width) - svg_padding,
													"height":Math.floor(real_rect.height) - svg_padding,
													}

											if(rect.width > 50 && log_data.length > 100){
												//console.log("log_data.length before pruning: ", log_data.length);
												while(log_data.length > Math.floor(rect.width / 3) ){
													log_data.shift();
												}
												//console.log("log_data.length after pruning: ", log_data.length);
											}
											
											
										
											log_viz_el.innerHTML = '';
										
										
											const svg = d3.create("svg")
										    	.attr("title", "Dataviz")
										    	.attr("version", 1.1)
										    	.attr("xmlns", "http://www.w3.org/2000/svg")
												.attr("width", rect.width + 20)
												.attr("height", rect.height + 20)
												.attr("viewBox", [-20, -1*(svg_padding/2), rect.width, rect.height + (svg_padding/2)])
												.attr("style", "max-width: 100%; height: auto;");
										
											log_viz_el.appendChild(svg.node());
										
											const oldest = d3.min(log_data, d => d.d);
											const newest = Date.now(); //d3.max(log_data, d => d.d);
											const delta_millis = newest - oldest;

											
											const delta_millis_until_now = Date.now() - oldest;
											if(delta_millis_until_now > 120000){
												let time_delta_description_el = document.createElement('div');
												time_delta_description_el.classList.add('extension-dashboard-widget-log-time-description');
												let time_delta_description = '';
												
												let leftover_millis = delta_millis_until_now % (60000*60);
												let hours = Math.floor(delta_millis_until_now/(60000*60));
												if(hours == 1){
													time_delta_description = 'Last 1 hour'
												}
												else if(hours > 1){
													time_delta_description = 'Last ' + hours + ' hours'
												}
												if(leftover_millis > 120000){
													if(time_delta_description){
														time_delta_description = time_delta_description + ' and ' + Math.floor(leftover_millis / 60000) + ' minutes';
													}
													else{
														time_delta_description = 'Last ' + Math.floor(leftover_millis / 60000) + ' minutes';
													}
												}
												
												if(time_delta_description == ''){
													time_delta_description = 'Last ' + Math.floor(leftover_millis / 1000) + ' seconds';
												}
												time_delta_description_el.textContent = time_delta_description;
												log_viz_el.appendChild(time_delta_description_el);
												
											}
											
										
											const xScale = d3.scaleUtc()
												.domain([oldest, newest])
			        							.range([(svg_padding/2), rect.width - 20])
										

											const yScale = d3.scaleLinear()
												.domain([d3.min(log_data, d => d.v), d3.max(log_data, d => d.v)])
												.range([rect.height - svg_padding, 0]);
											
											
											var g = svg.append("g")
												.attr("transform", `translate(10,0)`)
												.call(d3.axisLeft(yScale))   
											/*
												.append("text")   
												.attr("fill", "#000")   
												.attr("transform", "rotate(-90)")   
												.attr("y", 6)   .attr("dy", "0.71em")   
												.attr("text-anchor", "end")  
												.text("Price ($)");
											*/
											

											// Add the actual graph line
											const line = d3.line()
												.x(d => xScale(d.d))
												.y(d => yScale(d.v));


											const path = svg.append('path')
									        	.datum(log_data)
									        	.attr('fill', 'none')
									        	.attr('stroke', 'currentColor')
												.attr('class', 'extension-dashboard-widget-log-line')
									        	.attr('stroke-width', 1.5)
									        	.attr('d', line);
										

											//var timeFormat = d3.timeFormat("%I:%M %p %a %Y");
											var timeFormat = null
										
											if(delta_millis > 67200000){ // 2 hours
												timeFormat = d3.timeFormat("%H"); // hourly ticks
											}
											else if(delta_millis > 300000){ // 5 minutes
												timeFormat = d3.timeFormat("%H:%M"); // tick on minutes
											}
											else{
												timeFormat = d3.timeFormat("%S"); // tick on seconds
											}
											if(timeFormat){
										    	svg.append("g")
										        	.attr("transform", `translate(0,${rect.height - 20})`)
										        	.call(d3.axisBottom(xScale).tickSizeOuter(0).ticks(5).tickPadding(5).tickFormat(timeFormat))
													/*
													.selectAll(".tick text")
													.attr("class", function(d,i){
														return "tick-text tick-text-month" + d.getUTCMonth();
													});
													*/
											}
											
											
											
											
											// TOOLTIP
											
											// Adds lots of vertical boxes which trigger a mouse-over state to show a tooltip
											svg.append("g")
											.attr("fill", "#fff")
											.selectAll()
											.data(log_data)
											.join("rect")
									        .attr("x", (d) => xScale(d.d))
									        .attr("y", (d) => yScale(d.v))
											.attr("class", "extension-dashboard-log-tooltip-data")
									        .attr("height", (d) => yScale(0) - yScale(d.v))
									        .attr("width", 3 ) // (last_ever_date - first_ever_date)
											//.append("title")
											//.text((d) => d.total);  // (d) => d.total   // function(d) { return d.total }
		
										    .on("mouseover", (d) => onMouseOver(d))                  
										    .on("mouseout", onMouseOut)
											
											
											const tooltip = d3.select("#extension-dashboard-log-tooltip");
	
											function onMouseOver(d){
												try{
													//console.log("onMouseOver:  d: ", d);
													//console.log("tooltip: ", tooltip);

													
												    tooltip
														.transition()        
														.duration(200)      
														.style("opacity", 1);    
		   
		  
													const tooltip_x = d.pageX - 12;
													const tooltip_y = d.pageY + 25;
													//console.log('tooltip_x: ', tooltip_x);
													//console.log('tooltip_y: ', tooltip_y);
		
													function limit_decimals(value){
														if(value > 100){
															return Math.round(value);
														}
														if(value > 10){
															return Math.round(value * 10) / 10;
														}
														else if(value > 0){
															if(parseInt(value) == value){
																return value;
															}
															else{
																return Math.round(value * 100) / 100;
															}
														}
														return value;
													}
		
											    	tooltip
														.text(limit_decimals(d.target['__data__']['v']))
														.style("cursor", "pointer")
														.style("left",tooltip_x + "px") 
														.style("top", tooltip_y + "px")
														.style("color", "#333333");
		
													
												}
												catch(err){
													console.error("dashboard: caught error in dataviz onMouseOver: ", err);
												}
	    
											}

											function onMouseOut(d){
    
											    tooltip.transition()        
											          .duration(500)      
											          .style("opacity", 0);  
											}
	
											
											
										
										}
									
									}
								}
							
							}
						
						}
						else{
							console.warn("dashboard: was unable to retrieve logs data");
						}
						
		            }).catch((err) => {
		                console.error("dashboard: error doing save dashboards request: ", err);
		            });
				}
				
			}
		}
		

		
		
		
		/*
		show_selected_dashboard_indicator(){
			//console.log("in show_selected_dashboard_indicator");
			
			if(this.dashboards.length){
				let selected_dashboard_indicator_container_el = document.getElementById('extension-dashboard-selected-dashboard-indicator-container');
				this.hide_selected_dashboard_indicator_time = new Date().getTime() + 1000;
				selected_dashboard_indicator_container_el.innerHTML = '';
			
				let indicator_container_el = document.createElement('div');
			
				for (let i = 0; i < this.dashboards.length; i++) {
					let indicator_el = document.createElement('div');
				
					if(i == this.current_dashboard_number){
						//console.log("show_selected_dashboard_indicator: at current dashboard number: ", i);
						indicator_el.classList.add('extension-dashboard-selected-dashboard-indicator-current');
					}
			
					indicator_container_el.appendChild(indicator_el);
				
				}
				selected_dashboard_indicator_container_el.appendChild(indicator_container_el);
			
				setTimeout(() => {
					if( new Date().getTime() > this.hide_selected_dashboard_indicator_time){
						selected_dashboard_indicator_container_el.innerHTML = '';
					}
				},1002);
			}
			
		}
		*/
		
		
		
		
		
		
		//
		//   SAVE DASHBOARDS
		//
		
        save_dashboards() {
            if(this.debug){
				//console.log('in save dashboard');
			}
            window.API.postJson(
                `/extensions/${this.id}/api/ajax`, {
                    'action': 'save',
                    'dashboards': this.dashboards
                }
            ).then((body) => {
                if(this.debug){
					console.log('dashboard debug: save dashboards response: ', body);
				}
            }).catch((err) => {
                console.error("dashboard: error doing save dashboards request: ", err);
            });
        }





		//
		//  UPDATE CLOCK WIDGETS
		//
		
		// TODO make updating clocks less reliant on the backend

        update_clock() {
			//console.log("in update_clock.  show_clock,show_date: ", this.show_clock, this.show_date);
            if (this.show_clock) {
				
                window.API.postJson(
                    `/extensions/dashboard/api/get_time`,
                ).then((body) => {
                    if (typeof body.hours != 'undefined') {


						// TIME
                        var hour_padding = "";
                        var minute_padding = "";
						let updated_time = body.hours + ":" + minute_padding + body.minutes;;

						let clock_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-time');
						if(clock_els){
							for(let ce = 0; ce < clock_els.length; ce++){
								clock_els[ce].textContent = updated_time;
							}
						}
						
						
						
                        // DAY
                        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                        
                        var nice_day_name = body.day_name
                        for (let i = 0; i < days.length; i++) {
                            if(days[i].startsWith(body.day_name) ){
                                nice_day_name = days[i];
                            }
                        }
						
						let day_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-date-day');
						if(day_els){
							for(let de = 0; de < day_els.length; de++){
								day_els[de].textContent = nice_day_name;
							}
						}
						
						
						// DATE
						let date_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-date-date');
						if(date_els){
							for(let de = 0; de < date_els.length; de++){
								date_els[de].textContent = body.date;
							}
						}
						
						
						// MONTH
                        //const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                        document.getElementById('extension-dashboard-date-month').innerText = body.month; //months[date.getMonth()];
						let month_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-date-month');
						if(month_els){
							for(let me = 0; me < month_els.length; me++){
								month_els[me].textContent = body.month;
							}
						}
						
                    }
                }).catch((err) => {
                    console.error("dashboard: error getting date/time: ", err);   
                });
            }
        }







		//
		//  VOCO TIMERS OVERLAY
		//


		// Get list of Voco timers from api every 5 seconds
        get_poll() {
			if (this.debug) {
				console.log("dashboard debu: in get_poll, polling for voco actions");
			}
            
			window.API.postJson(
                `/extensions/dashboard/api/poll`,
            ).then((body) => {
                if (this.debug) {
					//console.log("dashboard: voco actions: ", body);
				}
				this.poll_fail_count = 0;
				
				if(typeof body.action_times != 'undefined'){
					const previous_action_times_length = this.action_times.length;
					this.action_times = body.action_times;
					if(this.action_times.length != previous_action_times_length){
						this.update_voco_actions();
						if(this.debug){
							console.log("dashboard debug: get_poll: new Voco action_times: ", this.action_times);
						}
					}
				}
            }).catch((e) => {
                if (this.debug) {
					console.error("dashboard: error doing periodic poll for voco actions: ", e);
				}
				this.poll_fail_count = 12; // delays 12 * 5 seconds
            });
        }
		
		
		
		
		// Update the HTML of Voco timers
		update_voco_actions(){
			let voco_overlay_el = document.getElementById('extension-dashboard-voco-container');
			
			const d = new Date();
			let time = Math.floor(d.getTime() / 1000);
			
			for (let i = 0; i < this.action_times.length; i++) {
				const action = this.action_times[i];
				//console.log("voco action: ", action);
				
				try{
					if(action.slots.timer_type){
						const delta = action.moment - time;
						const item_id = "extension-dashboard-voco-" + action.intent_message.sessionId;
						
						let action_el = document.getElementById(item_id);
						
						if(delta >= 0 && delta < 3600){
							
							if(this.debug){
								//console.log("dashboard:  item_id, delta: ", item_id, delta);
							}
							
							if(action_el == null){
								if(this.debug){
									//console.log("dashboard: creating new voco timer DOM element");
								}
								action_el = document.createElement('div');
								action_el.classList.add('extension-dashboard-voco-item');
								action_el.classList.add('extension-dashboard-voco-item-' + action.slots.timer_type);
								action_el.id = item_id;
								action_el.innerHTML =  '<img src="/extensions/dashboard/images/' + action.slots.timer_type + '.svg"/><div class="extension-dashboard-voco-item-time"><span class="extension-dashboard-voco-item-minutes"></span><span class="extension-dashboard-voco-item-seconds"></span></div>';
								action_el.innerHTML += '<div class="extension-dashboard-voco-item-info"><h4 class="extension-dashboard-voco-item-title">' + action.slots.sentence + '</h4></div>';
								voco_overlay_el.appendChild(action_el);
							}
							else{
								if(this.debug){
									//console.log("dashboard: voco action_el already existed");
								}
							}
							let minutes = Math.floor(delta / 60);
							if(minutes == 0){minutes = ''}
							else if(minutes < 10){minutes = '0' + minutes}
					
							let seconds = Math.floor(delta % 60);
					
							if(minutes == '' && seconds == 0){seconds = ''}
							else if(seconds < 10){seconds = '0' + seconds}
					
							action_el.querySelector('.extension-dashboard-voco-item-minutes').innerText = minutes;
							action_el.querySelector('.extension-dashboard-voco-item-seconds').innerText = seconds; 
						}
						else{
							if(action_el){
								if(this.debug){
									//console.log("removing outdated Voco action item from DOM");
								}
								action_el.remove();
							}
						}
					}
					else{
						if(this.debug){
							//console.log("dashboard: voco timer had no timer type (likely a delayed switching of a device): ", action);
						}
					}
				}
				catch(e){
					console.error("dashboard: error parsing Voco timer: ", e);
				}
				
			}
			
		}


		

		
        // HELPER METHODS
		// TODO Are these still used?

        hasClass(ele, cls) {
            return !!ele.className.match(new RegExp('(\\s|^)' + cls + '(\\s|$)'));
        }

        addClass(ele, cls) {
            if (!this.hasClass(ele, cls)) ele.className += " " + cls;
        }

        removeClass(ele, cls) {
            if (this.hasClass(ele, cls)) {
                var reg = new RegExp('(\\s|^)' + cls + '(\\s|$)');
                ele.className = ele.className.replace(reg, ' ');
            }
        }


    }

    new Dashboard();

})();