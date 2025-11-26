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

			this.last_time_hide_clicked = 0;

			

			this.page_visible = true;
			document.addEventListener("visibilitychange", () => {
  			  if (document.hidden) {
  				  if(this.debug){
  					  console.log("dashboard debug: page became hidden");
  				  }
  				  this.page_visible = false;
  			  } else {
  				  if(this.debug){
  					  console.log("dashboard debug: page became visible");
  				  }
  				  this.page_visible = true;
  			  }
			});
			
			this.update_clock = true;
			this.last_time_clock_updated = 0;


            // Dashboard
            this.dashboards = {}; //{"grid0":{"gridstack":{"cellHeight":50,"margin":5,"minRow":2,"acceptWidgets":true,"subGridOpts":{"cellHeight":50,"column":"auto","acceptWidgets":true,"margin":5,"subGridDynamic":true},"subGridDynamic":true,"children":[{"x":0,"y":0,"content":"0","id":"0"},{"x":0,"y":1,"content":"1","id":"1"},{"x":1,"y":0,"content":"2","id":"2"},{"x":2,"y":0,"w":2,"h":3,"id":"sub0","subGridOpts":{"children":[{"x":0,"y":0,"content":"3","id":"3"},{"x":1,"y":0,"content":"4","id":"4"}],"cellHeight":50,"column":"auto","acceptWidgets":true,"margin":5,"subGridDynamic":true}},{"x":4,"y":0,"h":2,"id":"sub1","subGridOpts":{"children":[{"x":0,"y":0,"content":"5","id":"5"}],"cellHeight":50,"column":"auto","acceptWidgets":true,"margin":5,"subGridDynamic":true}}]}} };
            this.interval = 10; // in practice: how often to poll for voco changes // TODO: only do this poll if voco is installed
			
            this.interval_counter = 28; // used to run some functions every 30 seconds

			this.hide_selected_dashboard_indicator_time = 0;
			//this.dashboard_key_listener_added = false;

			this.slow_interval_counter = 57; // used to run some functions every 60 seconds
			this.slow_interval = 60;


            // Weather
            this.show_weather = false;
            this.weather_addon_exists = false;
			
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
			
			this.locally_saved_values = {};
			
			//console.log("ColorScheme: ", ColorScheme);
			
			this.color_settings = ['extension-dashboard-background-color','extension-dashboard-widget-background-color','extension-dashboard-widget-text-color','extension-dashboard-widget-editable-text-color'];
			this.default_color_settings = ['#3089bf','#cfdde6','#555555','#3089bf'];
			
			if(localStorage.getItem('extension_dashboard_locally_saved_values')){
				try{
					let decoded_locally_saved_values = localStorage.getItem('extension_dashboard_locally_saved_values');
					decoded_locally_saved_values = JSON.parse(decoded_locally_saved_values);
					this.locally_saved_values = decoded_locally_saved_values;
					//console.log("dashboard: this.locally_saved_values is now: ", this.locally_saved_values);
					
					for(let c = 0; c < this.color_settings.length; c++){
						if(typeof this.locally_saved_values[this.color_settings[c]] == 'string' && this.locally_saved_values[this.color_settings[c]].startsWith('#')){
							document.documentElement.style.setProperty('--' + this.color_settings[c], this.locally_saved_values[this.color_settings[c]]);
						}
					}
					
				}
				catch(err){
					console.error("dashboard: caught error loading locally_saved_values: ", err);
					localStorage.removeItem('extension_dashboard_locally_saved_values');
					this.locally_saved_values = {};
				}
			}
			
			
			this.all_things = null;
			this.last_time_things_updated = 0;
			
			this.logs = null; // will hold info about the logs from window.API
			this.last_time_logs_updated = 0;
			this.current_logs = []; // which logs are visible on the current dashboard
			
			this.logs_data = null;	 // become a dictionary with the actual raw boolean and number datapoints from the logs
			this.last_time_logs_loaded = 0;
			
			this.icon_dirs = [];
			this.icon_paths = [];
			
			
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
			this.currently_relevant_thing_ids = [];
			
			this.recent_events = {};
			
			// likely becomes null at this point, since show() has not been called yet
			this.modal_el = null; //document.getElementById('extension-dashboard-widget-modal');
			this.settings_modal_el = null;
			
			this.delay_show_until_after_hide = false;
			this.dashboard_menu_item = document.getElementById('extension-dashboard-menu-item');
			if(this.dashboard_menu_item){
				//console.log("dashboard: OK, menu item exists");
				this.dashboard_menu_item.addEventListener('click', () => {
					//console.log("clicked on dashboard menu button");
					this.modal_el = document.getElementById('extension-dashboard-widget-modal');
					if(this.modal_el){
						this.delay_show_until_after_hide = true;
					}
				});
				
			}
			
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
					
					console.log("dashboard debug: initial this.locally_saved_values: ", this.locally_saved_values);
                }
				
				if(typeof body['dashboards'] != 'undefined'){
                    this.dashboards = body['dashboards'];
					//console.log("received dashboards data from backend: ", JSON.stringify(body['dashboards'],null,4));
					if(typeof this.dashboards[this.current_grid_id] == 'undefined'){
						this.current_grid_id = 'grid0';
					}
				}
				
				if(typeof body['icons'] != 'undefined'){
                    this.icons = body['icons'];
					//console.log("received icons data from backend: ", this.icons);
					this.parse_icons();
				}
				
                if(typeof body.start_with_background == 'boolean' && body.start_with_background == true && !document.location.href.endsWith("dashboard")){
					const dashboard_menu_item = document.getElementById('extension-dashboard-menu-item');
					if(dashboard_menu_item){
						this.delay_show_until_after_hide = true;
						dashboard_menu_item.click(); 
					}
                }
				
                if(typeof body.animations == 'boolean'){
					this.animations = body.animations;
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
			if (this.content == '') {
				return
			}
			if(this.delay_show_until_after_hide && document.getElementById('extension-dashboard-content')){
	            if(this.debug){
					console.warn("\n\ndashboard debug: show(): aborting, as dashboard seems to already be rendered\n\n");
				}
				return
			}
			setTimeout(() => {
				this.really_show();
			},100);
		}
			
		really_show() {
            if(this.debug){
				console.warn("\n\ndashboard debug: in dashboard show()\n\n");
			}
			
            if (this.content == '') {
				console.error("dashboard: show: this.content is empty. Aborting.");
				this.view.innerHTML = '';
                return;
            } else {
                this.view.innerHTML = this.content;
				/*
				// Attempt to avoid issues with hide();
				if(this.delay_show_until_after_hide && retried == false){
					
					setTimeout(() => {
						if(this.delay_show_until_after_hide == false){
							this.show(true);
						}
						else{
							this.show();
						}
						
					},1000);
					return
				}
				*/
            }
			
			
			if(document.body.classList.contains('developer')){
				this.developer = true;
			}
			else{
				this.developer = false;
			}


			this.content_el = document.getElementById('extension-dashboard-content');
			if(this.content_el){
				
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
				this.settings_modal_el = document.getElementById('extension-dashboard-settings-modal');
				
			}
			else{
				if(this.debug){
					console.error("dashboard: no content element?");
				}
				return;
			}


			
			
			
            // EVENT LISTENERS

			// manage dashboards button
            document.getElementById("extension-dashboard-edit-button-container").addEventListener('click', () => {
				
				if(this.hasClass(this.content_el,'extension-dashboard-editing')){
					this.content_el.classList.remove('extension-dashboard-editing');
					this.editing = false;
					
					if(this.modal_el.open){
						this.modal_el.close();
					}
					
					this.save_grid();
					
					if(this.modal_el == null){
						if(this.debug){
							console.warn("dashboard: had to create this.modal_el again!");
						}
						this.modal_el = document.getElementById('extension-dashboard-widget-modal');
					}
					//this.show_dashboard();
					if(this.grids[this.current_grid_id]){
						this.grids[this.current_grid_id].setStatic( true );
					}
					this.set_tab_buttons_draggable(false);
					
					this.update_sidebar();
					
					this.update_clocks();
					this.update_voco_actions();
					
					/*
					if(this.grids[this.current_grid_id]){
						this.grids[this.current_grid_id].setStatic(true);
					}
					*/
					
				}
				else{
					this.content_el.classList.add('extension-dashboard-editing');
					this.editing = true;
					
					if(this.grids[this.current_grid_id]){
						this.grids[this.current_grid_id].setStatic( false );
					}
					this.set_tab_buttons_draggable(true);
				}
				
            });
			
			
			
			
			// Clicking on dashboard to close overlay?
			/*
            document.getElementById("extension-dashboard-main-page").addEventListener('click', () => {
				if(this.modal_el && this.modal_el.open){
					this.modal_el.close();
				}
            });
			*/
			
			
			if(!document.getElementById("extension-dashboard-main-page").classList.contains('extension-dashboard-has-swipe-listener')){
				document.getElementById("extension-dashboard-main-page").classList.add('extension-dashboard-has-swipe-listener');
			
				document.getElementById("extension-dashboard-main-page").addEventListener('touchstart', e => {
					if(this.debug){
						console.log("dashboard debug: touch start");
					}
					this.touchstartX = e.changedTouches[0].screenX;
				}, {
            		passive: true
        		});

				document.getElementById("extension-dashboard-main-page").addEventListener('touchend', e => {
					if(this.debug){
						console.log("dashboard debug: touchend event: ", e);
					}
					this.touchendX = e.changedTouches[0].screenX;
					
					if(this.editing == false && e.srcElement.tagName != 'INPUT' && e.target.tagName != 'INPUT'){
						this.check_swipe_direction();
					}
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
							
							}
							
							
							
		                }
				
						// Every X seconds run the slow update of settings
						if (this.slow_interval_counter > this.slow_interval) {
							this.slow_interval_counter = 0;
					
							// if there are network connection issues, wait before doing the next request until this counter is zero again.
							if(this.get_init_error_counter > 0){
								this.get_init_error_counter--;
							}
					
							let now = new Date();
							let hours = now.getHours();
							
							if(hours < 7 || hours > 20){
								this.content_el.classList.add('extension-dashboard-night');
							}
							else{
								this.content_el.classList.remove('extension-dashboard-night');
							}
							//this.get_init();
							
							this.render_logs(); // every 30 seconds update any visible log widgets
						}
				
						
						// every second adjust the second counters of voco timers
						this.update_voco_actions();
						
					
				
						//console.log("this.update_clock: ", this.update_clock);
						// At the start of each new minute update the clock
						if (this.update_clock) {
							if ( new Date().getSeconds() === 0 ){
								this.update_clocks();
							}
							else if(new Date().getSeconds() % 5 == 0){
								this.update_clocks();
							}
						};
						
					}
					
	                //console.log(this.interval_counter);
	            }, 1000);
				
				
				// Once per day
				setInterval(function() {
					this.update_moon();
					this.update_things_data();
				}, 86400000);
				
				
				
				
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
            
			
			this.update_things_data()
			.then(() => {
				return this.get_init();
			})
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
				
                if(typeof body.animations == 'boolean'){
					this.animations = body.animations;
					
					if(this.animations == false){
						this.content_el.classList.add('extension-dashboard-hide-animations');
					}
                }
				
                if(typeof body.show_voco_timers == 'boolean'){
					this.show_voco_timers = body.show_voco_timers;
					if(this.debug){
						console.log("dashboard debug: show_voco_timers: ", this.show_voco_timers);
					}
                }
				
				//this.update_sidebar();
				this.show_dashboard();
				
				this.update_clocks();
				
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
				
				this.save_grid();
				
				this.generate_widget_content(this.current_grid_id, this.current_widget_id);
				//console.log("- this.modal_el.open after generate_widget_content is now: ", this.modal_el.open);
				
				const last_edited_widget_type = this.get_last_edited_widget_type();
				if(this.debug){
					console.log("dashboard debug: last_edited_widget_type: ", last_edited_widget_type);
				}
				
				if(last_edited_widget_type == 'log'){
					if(this.debug){
						console.log("dashboard debug: doing a quick logs re-render after editing a log");
					}
					this.render_logs(true); // do a quick re-render
				}
				
			});
			
			
			
			
			/*   DASHBOARD COLOR SETTINGS  */
			
			document.getElementById('extension-dashboard-settings-modal-done-button').addEventListener('click', () => {
				this.settings_modal_el.close();
			});
			
			document.getElementById('extension-dashboard-settings-modal-reset-button').addEventListener('click', () => {
				document.documentElement.style.setProperty('--extension-dashboard-background-color', '#3089bf');
				document.documentElement.style.setProperty('--extension-dashboard-widget-background-color', '#cfdde6');
				document.documentElement.style.setProperty('--extension-dashboard-widget-text-color', '#555555');
				document.documentElement.style.setProperty('--extension-dashboard-widget-editable-text-color', '#3089bf');
				
				const new_color = null;
				this.locally_saved_values['extension-dashboard-background-color'] = new_color;
				this.locally_saved_values['extension-dashboard-widget-background-color'] = new_color;
				this.locally_saved_values['extension-dashboard-widget-text-color'] = new_color;
				this.locally_saved_values['extension-dashboard-widget-editable-text-color'] = new_color;
				localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));
				
				for(let c = 0; c < this.color_settings.length; c++){
					const color_setting_input_el = document.querySelector('#extension-dashboard-setting-' + this.color_settings[c]);
					if(color_setting_input_el){
						color_setting_input_el.value = this.default_color_settings[c];
					}
				}
				
			});
			
			document.getElementById('extension-dashboard-setting-extension-dashboard-background-color').addEventListener('change', () => {
				const new_color = document.getElementById('extension-dashboard-setting-extension-dashboard-background-color').value;
				//document.getElementById('extension-dashboard-main-page').style.backgroundColor = new_color;
				if(typeof new_color == 'string' && new_color.startsWith('#')){
					if(this.debug){
						console.log("dashboard debug: new_color: ", new_color);
					}
					document.documentElement.style.setProperty('--extension-dashboard-background-color', new_color);
					this.locally_saved_values['extension-dashboard-background-color'] = new_color;
					localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));
				}
			});
			
			document.getElementById('extension-dashboard-setting-extension-dashboard-widget-background-color').addEventListener('change', () => {
				const new_color = document.getElementById('extension-dashboard-setting-extension-dashboard-widget-background-color').value;
				if(typeof new_color == 'string' && new_color.startsWith('#')){
					if(this.debug){
						console.log("dashboard debug: new_color: ", new_color);
					}
					document.documentElement.style.setProperty('--extension-dashboard-widget-background-color', new_color);
					this.locally_saved_values['extension-dashboard-widget-background-color'] = new_color;
					localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));
				}
			});
			
			document.getElementById('extension-dashboard-setting-extension-dashboard-widget-text-color').addEventListener('change', () => {
				const new_color = document.getElementById('extension-dashboard-setting-extension-dashboard-widget-text-color').value;
				if(typeof new_color == 'string' && new_color.startsWith('#')){
					if(this.debug){
						console.log("dashboard debug: new_color: ", new_color);
					}
					document.documentElement.style.setProperty('--extension-dashboard-widget-text-color', new_color);
					this.locally_saved_values['extension-dashboard-widget-text-color'] = new_color;
					localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));
				}
			});
			
			document.getElementById('extension-dashboard-setting-extension-dashboard-widget-editable-text-color').addEventListener('change', () => {
				const new_color = document.getElementById('extension-dashboard-setting-extension-dashboard-widget-editable-text-color').value;
				if(typeof new_color == 'string' && new_color.startsWith('#')){
					if(this.debug){
						console.log("dashboard debug: new_color: ", new_color);
					}
					document.documentElement.style.setProperty('--extension-dashboard-widget-editable-text-color', new_color);
					this.locally_saved_values['extension-dashboard-widget-editable-text-color'] = new_color;
					localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));
				}
			});
			
			for(let c = 0; c < this.color_settings.length; c++){
				if(typeof this.locally_saved_values[this.color_settings[c]] == 'string' && this.locally_saved_values[this.color_settings[c]].startsWith('#')){
					const color_setting_input_el = document.querySelector('#extension-dashboard-setting-' + this.color_settings[c]);
					if(color_setting_input_el){
						color_setting_input_el.value = this.locally_saved_values[this.color_settings[c]];
					}
					else{
						if(this.debug){
							console.error("dashboard: did not find color input element to update from localstorage: ", this.color_settings[c]);
						}
					}
				}
			}
			
			
			document.getElementById('extension-dashboard-setting-widget-random-colors-button').addEventListener('click', () => {
				//console.log("random colors");
				this.generate_random_color_scheme();
			});
			
			document.getElementById('extension-dashboard-setting-widget-random-shadow-button').addEventListener('click', () => {
				//console.log("random shadow");
				this.apply_random_box_shadow();
			});
			
			if(typeof this.locally_saved_values['widget_shadow'] == 'string'){
				this.modify_css('.grid-stack > .grid-stack-item > .grid-stack-item-content > div:not(.extension-dashboard-configure-widget-button)', 'box-shadow', this.locally_saved_values['widget_shadow']);
				document.getElementById('extension-dashboard-setting-widget-shadow').value = this.locally_saved_values['widget_shadow'];
			}
			
			document.getElementById('extension-dashboard-setting-widget-shadow').addEventListener('change', () => {
				let fresh_shadow = document.getElementById('extension-dashboard-setting-widget-shadow').value;
				if(fresh_shadow == ''){
					fresh_shadow = 'none';
				}
				this.modify_css('.grid-stack > .grid-stack-item > .grid-stack-item-content > div:not(.extension-dashboard-configure-widget-button)','box-shadow',fresh_shadow);
			
				this.locally_saved_values['widget_shadow'] = fresh_shadow;
				localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));
			});
			
			
			
			
		} // end of show function



        hide() {
			if(this.debug){
				console.warn("\n\ndashboard debug: in hide()\n\n");
			}
			
			if(this.delay_show_until_after_hide == false){
				if(this.debug){
					console.warn("DASHBOARD: HIDE: CLEANING UP");
				}
	            try {
					if(this.dashboard_interval){
						window.clearInterval(this.dashboard_interval);
					}
					this.dashboard_interval = null;
	            } catch (err) {
					if(this.debug){
	                	console.warn("dashboard: error, could not clear dashboard_interval: ", err);
					}
	            }
			
				
				this.update_clock = false;
			
				this.current_logs = [];
			
				this.grids = {};
			
				this.view.innerHTML = '<h1>Loading the dashboard failed</h1>';
				console.log("hide(): closing all websockets");
				for (const [websocket_thing_id, websocket_client] of Object.entries( this.websockets )) {
					if(websocket_client){
						console.log("closing websock for: ", websocket_thing_id)
						websocket_client.close(websocket_thing_id);
						setTimeout(() => {
							console.log("deleting websock for: ", websocket_thing_id)
							delete this.websockets[websocket_thing_id];
							if(this.debug){
								console.log("dashboard debug: hide(): closed and deleted websocket client for ", websocket_thing_id);
							}
						},100);
					}
				}
			}
			else{
				if(this.debug){
					console.warn("dashboard debug: hide(): not cleaning up");
				}
			}
			
			this.delay_show_until_after_hide = false;
			
			
            
			
			
			
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


		modify_css(selector, cssProp, cssVal){
			// ssMain is the stylesheet's index based on load order. See document.styleSheets. E.g. 0=reset.css, 1=main.css.
			var ssMain = 1;
			var cssRules = (document.all) ? 'rules': 'cssRules';

			for (let w=0; w<document.styleSheets.length; w++) {
				//console.log("CSS stylsheet #", w, " had number of styles: ", document.styleSheets[w][cssRules].length);
				for (let i=0; i < document.styleSheets[w][cssRules].length; i++) {
					//console.log("CSS selector: ", document.styleSheets[w][cssRules][i].selectorText);
					if (document.styleSheets[w][cssRules][i].selectorText === selector) {
						document.styleSheets[w][cssRules][i].style[cssProp] = cssVal;
						if(this.debug){
							console.log("dashboard debug: CSS modified: ", cssProp, cssVal);
						}
						return;
					}
				}
			}
			
		}

		generate_random_color_scheme(){
			const randomNumber = () => {
				return Math.floor(Math.random() * 360)
			};
			
			const variations = ['pastel', 'soft', 'pale'];
			const random_variation = variations[  Math.floor(Math.random() * variations.length) ];
			//console.log("random color scheme variation: ", random_variation);
			
			const scheme = new ColorScheme;
			scheme
			.from_hue(randomNumber())
			.scheme('mono') // triade, contrast, analogic, mono
			.distance(Math.random())
			.variation(random_variation); // pastel, soft, pale
			let fresh_paint = scheme.colors();
			
			fresh_paint.sort(() => 0.5 - Math.random());
			//let randomItems = array.slice(0, 4);
			
			//console.log("COLORS: ", fresh_paint);
		   
			for(let c = 0; c < this.color_settings.length; c++){
			
      			document.documentElement.style.setProperty('--' + this.color_settings[c], '#' + fresh_paint[c]);
			
      			this.locally_saved_values[this.color_settings[c]] = '#' + fresh_paint[c];
			
      			const color_setting_input_el = document.querySelector('#extension-dashboard-setting-' + this.color_settings[c]);
      			if(color_setting_input_el){
      				color_setting_input_el.value = '#' + fresh_paint[c];
      			}
			}
			
						
			localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));

		}


		apply_random_box_shadow(){
			const shadows = [
				"none",
				"rgba(50, 50, 93, 0.25) 0px 50px 100px -20px, rgba(0, 0, 0, 0.3) 0px 30px 60px -30px",
				"rgba(100, 100, 111, 0.2) 0px 7px 29px 0px","1px 0 10px 10px rgba(0, 0, 0, 0.03)",
				"rgba(0, 0, 0, 0.09) 0px 2px 1px, rgba(0, 0, 0, 0.09) 0px 4px 2px, rgba(0, 0, 0, 0.09) 0px 8px 4px, rgba(0, 0, 0, 0.09) 0px 16px 8px, rgba(0, 0, 0, 0.09) 0px 32px 16px",
				"rgba(0, 0, 0, 0.17) 0px -23px 25px 0px inset, rgba(0, 0, 0, 0.15) 0px -36px 30px 0px inset, rgba(0, 0, 0, 0.1) 0px -79px 40px 0px inset, rgba(0, 0, 0, 0.06) 0px 2px 1px, rgba(0, 0, 0, 0.09) 0px 4px 2px, rgba(0, 0, 0, 0.09) 0px 8px 4px, rgba(0, 0, 0, 0.09) 0px 16px 8px, rgba(0, 0, 0, 0.09) 0px 32px 16px",
				"rgba(0, 0, 0, 0.45) 0px 25px 20px -20px",
				"rgba(14, 63, 126, 0.04) 0px 0px 0px 1px, rgba(42, 51, 69, 0.04) 0px 1px 1px -0.5px, rgba(42, 51, 70, 0.04) 0px 3px 3px -1.5px, rgba(42, 51, 70, 0.04) 0px 6px 6px -3px, rgba(14, 63, 126, 0.04) 0px 12px 12px -6px, rgba(14, 63, 126, 0.04) 0px 24px 24px -12px",
				"rgba(149, 157, 165, 0.2) 0px 8px 24px;",
				"rgba(50, 50, 93, 0.25) 0px 50px 100px -20px, rgba(0, 0, 0, 0.3) 0px 30px 60px -30px, rgba(10, 37, 64, 0.35) 0px -2px 6px 0px inset",
				"rgba(17, 12, 46, 0.15) 0px 48px 100px 0px",
				"rgba(50, 50, 93, 0.25) 0px 30px 60px -12px inset, rgba(0, 0, 0, 0.3) 0px 18px 36px -18px inset",
				"rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.06) 0px 2px 4px -1px",
				"rgba(0, 0, 0, 0.1) 0px 10px 50px",
				"rgba(50, 50, 93, 0.25) 0px 50px 100px -20px, rgba(0, 0, 0, 0.3) 0px 30px 60px -30px",
				"rgba(0, 0, 0, 0.09) 0px 2px 1px, rgba(0, 0, 0, 0.09) 0px 4px 2px, rgba(0, 0, 0, 0.09) 0px 8px 4px, rgba(0, 0, 0, 0.09) 0px 16px 8px, rgba(0, 0, 0, 0.09) 0px 32px 16px",
				"rgba(0, 0, 0, 0.2) 0px 60px 40px -7px",
				"rgba(0, 0, 0, 0.25) 0px 54px 55px, rgba(0, 0, 0, 0.12) 0px -12px 30px, rgba(0, 0, 0, 0.12) 0px 4px 6px, rgba(0, 0, 0, 0.17) 0px 12px 13px, rgba(0, 0, 0, 0.09) 0px -3px 5px",
				"rgba(0, 0, 0, 0.56) 0px 22px 70px 4px",
				"rgba(0, 0, 0, 0.35) 0px -50px 36px -28px inset",
				"rgba(0, 0, 0, 0.4) 0px 30px 90p;",
				"rgba(0, 0, 0, 0.25) 0px 14px 28px, rgba(0, 0, 0, 0.22) 0px 10px 10px",
				"rgba(240, 46, 170, 0.4) 5px 5px, rgba(240, 46, 170, 0.3) 10px 10px, rgba(240, 46, 170, 0.2) 15px 15px, rgba(240, 46, 170, 0.1) 20px 20px, rgba(240, 46, 170, 0.05) 25px 25px"
			]
			
			//let random_index = Math.floor(Math.random() * shadows.length);
			let random_shadow = shadows[  Math.floor(Math.random() * shadows.length) ];
			if(this.debug){
				console.log("dashboard debug: random_shadow: ", random_shadow);
			}
			document.getElementById('extension-dashboard-setting-widget-shadow').value = random_shadow;
			this.modify_css('.grid-stack > .grid-stack-item > .grid-stack-item-content > div:not(.extension-dashboard-configure-widget-button)','box-shadow',random_shadow);
			
			this.locally_saved_values['widget_shadow'] = random_shadow;
			localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));
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





		delete_dashboard(grid_id=null){
			if(this.debug){
				console.log("dashboard debug: in delete_dashboard.  grid_id: ", grid_id);
			}
			if(typeof grid_id == 'string' && grid_id.startsWith('grid')){
				if(typeof this.dashboards[grid_id] != 'undefined'){
					delete this.dashboards[grid_id];
				}
				if(typeof this.grids[grid_id] != 'undefined'){
					delete this.grids[grid_id];
				}
				
				let tab_el = document.querySelector('#extension-dashboard-tab-' + grid_id);
				if(tab_el){
					//console.log("delete_dashboard: also removing the tab");
					tab_el.remove();
				}
				
				if(grid_id == this.current_grid_id){
					if(Object.keys(this.dashboards).length){
						this.current_grid_id = Object.keys(this.dashboards)[0];
					}
					else{
						this.current_grid_id = 'grid0';
						this.dashboards['grid0'] = {"widgets":{}};
					}
				}
				
				localStorage.setItem("candle_dashboard_grid_id", this.current_grid_id);
				
				//this.update_sidebar();
				this.show_dashboard();
			}
		}
		
		
		

		update_sidebar(action=null){
			if(this.debug){
				console.log("dashboard debug: in update_sidebar. Action: ", action);
			}
			
			let tabs_menu_el = document.getElementById('extension-dashboard-tab-menu');
			if(tabs_menu_el){
				const dashboards_keys = Object.keys(this.dashboards);
				//console.log("dashboards_keys: ", dashboards_keys);
				
				if(dashboards_keys.length == 0){
					action = 'add_dashboard';
				}
				
				if(action == 'add_dashboard'){
					let new_grid_id = null;
					var new_grid_index = 0;
					while (typeof this.dashboards['grid' + new_grid_index] != 'undefined'){
						new_grid_index++;
					}
					if(this.debug){
						console.log("dashboard debug: update_sidebar: add dashboard: first available new_grid_index: ", new_grid_index);
					}
					new_grid_id = 'grid' + new_grid_index;
					this.dashboards[new_grid_id] = {"widgets":{}};
					this.current_grid_id = new_grid_id;
					console.log("update_sidebar:  add_dashboard:  this.current_grid_id is now: ", this.current_grid_id);
					setTimeout(() => {
						this.show_dashboard();
						//this.update_sidebar();
					},50);
				}
				
				tabs_menu_el.innerHTML = '';
				
				
				// ADD DROPZONE TO REMOVE WIDGET
				
				let trash_zone_el = document.createElement('div');
				trash_zone_el.setAttribute('id','extension-dashboard-trash');
				trash_zone_el.classList.add('extension-dashboard-trash');
				trash_zone_el.classList.add('extension-dashboard-show-if-editing');
				trash_zone_el.addEventListener('click', () => {
					if(confirm("Are you sure you want to remove this dashboard?")){
						this.delete_dashboard(this.current_grid_id);
					}
					
					// removeWidget(this.parentElement.parentElement)
				});
				
				
				trash_zone_el.addEventListener('dragenter', (event) => {
					event.preventDefault();
					//console.log("something was dragged entering the trash can: ", event);
				});
				
				trash_zone_el.addEventListener('dragleave', (event) => {
					event.preventDefault();
					//console.log("something was dragged entering the trash can: ", event);
				});
				
				trash_zone_el.addEventListener('dragover', (event) => {
					event.preventDefault();
					//console.log("something was dragged over the trash can: ", event);
				});
				
				trash_zone_el.addEventListener('drop', (event) => {
					event.preventDefault();
					//console.log("something was dropped on the trash can");
					
					const grid_id = event.dataTransfer.getData("text");
					//console.log("- drag-and-drop transfered grid_id: ", grid_id);
					if(typeof grid_id == 'string' && grid_id.startsWith('grid') && typeof this.dashboards[grid_id] != 'undefined'){
						if(typeof this.dashboards[grid_id]['widgets'] != 'undefined' && Object.keys(this.dashboards[grid_id]['widgets']).length > 3 ){
							if(confirm("Are you sure you want to remove dashboard " + grid_id.replace('grid','') + "?" )){
								this.delete_dashboard(grid_id);
							}
						}
						else {
							this.delete_dashboard(grid_id);
						}
						
					}
				});
				
				
				
				let widget_management_container_el = document.createElement('div');
				widget_management_container_el.classList.add('extension-dashboard-flex');
				
				tabs_menu_el.appendChild(trash_zone_el);
				
				widget_management_container_el.appendChild(trash_zone_el);
				
				
				let tab_name_input_el = document.createElement('input');
				
				
				
				// ADD BUTTON TO ADD WIDGET
				
				let add_widget_button_el = document.createElement('div');
				add_widget_button_el.setAttribute('id','extension-dashboard-add-widget-button');
				add_widget_button_el.classList.add('extension-dashboard-show-if-editing');
				//add_widget_button_el.textContent = '+';
				add_widget_button_el.addEventListener('click', () => {
					this.add_main_widget();
				})
				
				widget_management_container_el.appendChild(add_widget_button_el);
				
				
				// ADD BUTTON TO ADD DASHBOARD TAB
				
				let add_dashboard_button_el = document.createElement('div');
				add_dashboard_button_el.setAttribute('id','extension-dashboard-add-dashboard-button');
				add_dashboard_button_el.classList.add('extension-dashboard-show-if-editing');
				//add_dashboard_button_el.textContent = '+';
				add_dashboard_button_el.addEventListener('click', () => {
					this.save_grid();
					this.update_sidebar('add_dashboard');
					setTimeout(() => {
						const new_tab_name_input_el = this.view.querySelector('.extension-dashboard-tab-name-input');
						if(new_tab_name_input_el){
							new_tab_name_input_el.focus();
						}
					},100);
				})
				//tabs_menu_el.appendChild(add_dashboard_button_el);
				
				//tab_buttons_container_container_el.appendChild(add_dashboard_button_el);
				widget_management_container_el.appendChild(add_dashboard_button_el);
				
				
				
				// ADD BUTTON TO OPEN SETTINGS
				
				let open_settings_button_el = document.createElement('div');
				open_settings_button_el.setAttribute('id','extension-dashboard-open-settings-button');
				open_settings_button_el.classList.add('extension-dashboard-show-if-editing');
				open_settings_button_el.addEventListener('click', () => {
					if(this.settings_modal_el == null){
						console.error("had to quickly this.create settings_modal_el");
						this.settings_modal_el = document.getElementById('extension-dashboard-settings-modal');
					}
					if(this.settings_modal_el){
						this.settings_modal_el.showModal();
					}
					
				})
				widget_management_container_el.appendChild(open_settings_button_el);
				
				
				
				//tabs_menu_el.appendChild(add_widget_button_el);
				
				
				
				tabs_menu_el.appendChild(widget_management_container_el);
				
				if(this.debug){
					console.log("dashboard debug: update_sidebar: dashboards_keys.length: ", dashboards_keys.length);
				}
				//let tab_buttons_container_container_el = document.createElement('div');
				//tab_buttons_container_container_el.classList.add('extension-dashboard-tab-buttons-container-container');
				//tab_buttons_container_container_el.classList.add('extension-dashboard-flex-center');
				
				let tab_buttons_container_el = document.createElement('div');
				tab_buttons_container_el.setAttribute('id','extension-dashboard-tab-buttons-container');
				tab_buttons_container_el.classList.add('extension-dashboard-flex');
				
				const tabs_container_el = document.getElementById('extension-dashboard-tabs');
				if(tabs_container_el){
					
					// hide all the tabs first
					for(let tc = 0; tc < tabs_container_el.children.length; tc++){
						tabs_container_el.children[tc].classList.remove('extension-dashboard-tab-selected');
					}
					
					let dashboard_counter = 0;
					for (const [grid_id, details] of Object.entries(this.dashboards)) {
						//if(this.debug){
						//	console.log(`dashboard debug: update_sidebar: grid_id and dashboard details: ${grid_id}: ${details}`);
						//}
				
						dashboard_counter++;
						
						let tab_el = document.querySelector('#extension-dashboard-tab-' + grid_id);
						
						if(tab_el == null){
							//console.log("adding a new dashboard tab");
							let new_tab_el = document.createElement('div');
							new_tab_el.setAttribute('id','extension-dashboard-tab-' + grid_id);
							new_tab_el.classList.add('extension-dashboard-tab');
							
							if(grid_id == this.current_grid_id){
								new_tab_el.classList.add('extension-dashboard-tab-selected');
								/*
								if(this.current_grid_id != 'grid0'){
									document.getElementById('extension-dashboard-tab-grid0').classList.remove('extension-dashboard-tab-selected');
								}
								*/
							}
							
							let grid_container_el = document.createElement('div');
							grid_container_el.setAttribute('id','extension-dashboard-' + grid_id);
							grid_container_el.classList.add('container-fluid');
							
							new_tab_el.appendChild(grid_container_el);
							
							tabs_container_el.appendChild(new_tab_el);
						}
						else{
							if(grid_id == this.current_grid_id){
								tab_el.classList.add('extension-dashboard-tab-selected');
							}
							//console.log("the tab element already seems to exist: ", tab_el);
							//tab_el.classList.add('extension-dashboard-tab-selected');
						}
						// let existing_tab = document.getElementById('extension-dashboard-tabs-')
				
						
				
						let show_dashboard_button_el = document.createElement('div');
						show_dashboard_button_el.setAttribute('id','extension-dashboard-show-' + grid_id);
				
						if(grid_id == this.current_grid_id){
							show_dashboard_button_el.classList.add('extension-dashboard-tab-button-selected');
							setTimeout(() => {
								show_dashboard_button_el.scrollIntoView({ behavior: "smooth", block: "start", inline: "start"});
							},100);
							if(this.editing){
								tab_name_input_el.classList.add('extension-dashboard-tab-name-input');
								tab_name_input_el.setAttribute('type','text');
								tab_name_input_el.setAttribute('placeholder','Name');
								tab_name_input_el.setAttribute('autocomplete','off');
								tab_name_input_el.setAttribute('maxlength','25');
								if(typeof details['name'] == 'string'){
									tab_name_input_el.value = details['name'];
								}
								tab_name_input_el.addEventListener('input', () => {
									//console.log("dashboard: tab name is being changed to: ", tab_name_input_el.value);
									this.dashboards[this.current_grid_id]['name'] = tab_name_input_el.value;
								});
								
								tab_buttons_container_el.appendChild(tab_name_input_el);
								continue
								
							}
							
							
						}
						
						show_dashboard_button_el.addEventListener('dragstart', (event) => {
							//console.log("drag started for: ", grid_id);
							
							//event.currentTarget.classList.add("extension-dashboard-being-dragged");
							event.dataTransfer.clearData();
							event.dataTransfer.setData("text/plain", grid_id);
							
						});
						
						show_dashboard_button_el.addEventListener('dragend', (event) => {
							//event.preventDefault();
							//event.currentTarget.classList.remove("extension-dashboard-being-dragged");
							//console.log("drag ended for: ", grid_id, event);
						});
						
						let show_dashboard_button_inner_el = document.createElement('div');
						show_dashboard_button_inner_el.classList.add('extension-dashboard-tab-button-with-name');
						show_dashboard_button_inner_el.classList.add('extension-dashboard-tab-button');
						
						let show_dashboard_button_text = dashboard_counter; //grid_id.replaceAll('grid','');
						if(typeof details['name'] == 'string' && details['name'].length){
							show_dashboard_button_text = details['name'];
							show_dashboard_button_inner_el.classList.add('extension-dashboard-tab-button-with-name');
						}
						show_dashboard_button_el.classList.add('extension-dashboard-tab-button-wrapper');
						
						show_dashboard_button_inner_el.textContent = show_dashboard_button_text;
						show_dashboard_button_el.appendChild(show_dashboard_button_inner_el);
						
						//show_dashboard_button_el.textContent = show_dashboard_button_text;
						show_dashboard_button_el.addEventListener('click', () => {
							//console.log("clicked on show_dashboard_button");
							if(this.editing){
								this.save_grid();
								this.show_dashboard(grid_id);
							}
							else{
								setTimeout(() => {
									show_dashboard_button_el.scrollIntoView({ behavior: "smooth", block: "start", inline: "start"});
								},100);
								this.show_dashboard(grid_id,false); // no need to fully redraw the sidebar
							}
							
						});
						
						if(dashboards_keys.length > 1){
							tab_buttons_container_el.appendChild(show_dashboard_button_el);
						}
				
					}
				}
				
				
				
				
				
				
				
				
				
				//tabs_menu_el.appendChild(tab_buttons_container_container_el);
				tabs_menu_el.appendChild(tab_buttons_container_el);
				
				
				
				// TAB NAME INPUT
				
				/*
				let tab_name_container_el = document.createElement('div');
				tab_name_container_el.classList.add('extension-dashboard-tab-name-input-container');
				tab_name_container_el.classList.add('extension-dashboard-show-if-editing');
				
				// this input el was created earlier, so that it could be pre-filled with the name earlier too
				
				
				tab_name_container_el.appendChild(tab_name_input_el);
				tabs_menu_el.appendChild(tab_name_container_el);
				*/
				
				if( 
					(window.innerWidth < 641 && (
									(tab_buttons_container_el.children.length > 3 && tab_buttons_container_el.textContent.length > 20) || 
									tab_buttons_container_el.textContent.length > 30
									)
					) || 
					(window.innerWidth < 800 && (
									tab_buttons_container_el.children.length > 4 || 
									tab_buttons_container_el.textContent.length > 40
									)
					) || 
					(window.innerWidth < 1000 && (
									(tab_buttons_container_el.children.length > 4 && tab_buttons_container_el.textContent.length > 40) || 
									tab_buttons_container_el.textContent.length > 60
									)
					)
				){
					if(this.debug){
						console.log("dashboard debug: narrow innerWidth; the tab buttons have a lot of text for such a small window.innerWidth: ", tab_buttons_container_el.textContent.length, tab_buttons_container_el.textContent, " has to fit in ", window.innerWidth);
					}
					tabs_menu_el.classList.add('extension-dashboard-wide-menu');
				}
				else{
					if(this.debug){
						console.log("dashboard debug: the innerWidth is not that narrow.  textContent character count: ", tab_buttons_container_el.textContent.length, ". \nThe menu textContent: ", tab_buttons_container_el.textContent, " ...should fit in ", window.innerWidth);
					}
					tabs_menu_el.classList.remove('extension-dashboard-wide-menu');
				}
				
			}
		}
		
		
		
		set_tab_buttons_draggable(draggable=true){
			const tab_buttons_container_el = document.getElementById('extension-dashboard-tab-buttons-container');
			if(tab_buttons_container_el){
				for(let tb = 0; tb < tab_buttons_container_el.children.length; tb++){
					if(tab_buttons_container_el.children[tb].tagName != 'INPUT'){
						tab_buttons_container_el.children[tb].setAttribute('draggable',draggable);
					}
				}
			}
		}



		
		// swipe left or right on a dashboard to navigate between them
		check_swipe_direction() {
			if(this.debug){
				console.log('dashboard debug: in check_swipe_direction');
			}
			//this.last_activity_time = new Date().getTime();
			if (this.touchendX < this.touchstartX - 100){
				if(this.debug){
					console.log('dashboard debug: swiped left');
				}
				this.next_dashboard_tab();
			}
			if (this.touchendX > this.touchstartX + 100){
				if(this.debug){
					console.log('dashboard debug: swiped right');
				}
				this.previous_dashboard_tab();
			}
	
		}



		previous_dashboard_tab(){
			if(this.debug){
				console.log("dashboard debug: previous_dashboard_tab: before this.current_grid_id: ", this.current_grid_id);
			}
			
			const grid_ids = Object.keys(this.dashboards);
			for(let gi = 0; gi < grid_ids.length; gi++){
				if(grid_ids[gi] == this.current_grid_id){
					if(gi > 0){
						this.current_grid_id = grid_ids[gi - 1];
					}
					else{
						this.current_grid_id = grid_ids[grid_ids.length - 1]; // wrap around
					}
					break;
				}
			}
			//this.update_sidebar();

			this.show_dashboard(null,false);
			if(this.debug){
				console.log("dashboard debug: previous_dashboard_tab:  this.current_grid_id is now: ", this.current_grid_id);
			}
			//this.show_selected_dashboard_indicator();
		}

		next_dashboard_tab(){
			if(this.debug){
				console.log("dashboard debug: next_dashboard_tab: before this.current_grid_id: ", this.current_grid_id);
			}
			const grid_ids = Object.keys(this.dashboards);
			for(let gi = 0; gi < grid_ids.length; gi++){
				if(grid_ids[gi] == this.current_grid_id){
					if(typeof grid_ids[gi + 1] != 'undefined'){
						this.current_grid_id = grid_ids[gi + 1];
					}
					else{
						this.current_grid_id = grid_ids[0]; // wrap around
					}
					break;
				}
			}
			//this.update_sidebar();
			this.show_dashboard(null,false);
			if(this.debug){
				console.log("dashboard debug: next_dashboard_tab:  this.current_grid_id is now: ", this.current_grid_id);
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
					{ w: 10000, c: 10, layout: 'moveScale' },
					{ w: 2000, c: 9, layout: 'moveScale' },
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
		show_dashboard(grid_id=null,update_sidebar=true){
			
			if(this.debug){
				console.log("dashboard debug: in show_dashboard.  grid_id, this.current_grid_id: ", grid_id, this.current_grid_id);
			}
			
			if(grid_id == null && this.current_grid_id != null){
				grid_id = this.current_grid_id;
			}
			else if(grid_id == null && this.current_grid_id == null){
				grid_id = this.current_grid_id = 'grid0';
				if(Object.keys(this.dashboards).length){
					grid_id = this.current_grid_id = Object.keys(this.dashboards)[0];
				}
			}
			
			
			
			
			
			
			if(this.tooltip_el == null){
				this.tooltip_el = this.view.querySelector('#extension-dashboard-log-tooltip');
			}
			if(this.tooltip_el){
				this.tooltip_el.setAttribute('left','-1000');
				this.tooltip_el.setAttribute('opacity','0');
			}
			
			this.update_clock = false;
			
			this.highest_spotted_widget_id = 0;
			
			this.current_logs = []; // keep track of which logs need to be rendered later
			//this.websockets_lookup = {} // keep track of which websockets are needed, and for which properties they are currently used. i.e. this.websockets_lookup[thing_id] = [property, property2, etc]
			
			let switched_to_other_dashboard = null;
			if(this.current_grid_id != grid_id || this.current_grid_id == null){
				switched_to_other_dashboard = true;
				if(this.debug){
					console.log("switching to different dashboard");
				}
				
				//this.current_grid_id = grid_id;
			}
				
			this.current_grid_id = grid_id;
			localStorage.setItem("candle_dashboard_grid_id", grid_id);
			
			if(typeof this.dashboards[grid_id] == 'undefined'){
				if(this.debug){
					console.error("dashboard debug: show_dashboard: that dashboard does not exist. Creating it now: ", grid_id);
				}
				this.dashboards[grid_id] = {"widgets":{}};
				//return
			}
			if(this.debug){
				console.log("dashboard debug: show_dashboard: data to render: ", this.dashboards[grid_id]);
			}
			
			
			// This generates the dashboards tab menu, but it also generates the tab HTML itself. So this must be run before it's filled with a gristack element below.
			
			if(update_sidebar){
				this.update_sidebar();
			}
			else{
				const show_dashboard_button_el = this.view.querySelector('#extension-dashboard-show-' + grid_id);
				if(show_dashboard_button_el){
					show_dashboard_button_el.scrollIntoView({ behavior: "smooth", block: "start", inline: "start"});
				}
			}
			
			
			
			
			
			if(typeof this.dashboards[grid_id]['gridstack'] == 'undefined'){
				if(this.debug){
					console.warn("show_dashbooard: no gridstack data in dashboard_data for index: ", grid_id);
				}
				this.dashboards[grid_id]['gridstack'] = this.new_dashboard();
			}
			
			let gridstack_container = document.querySelector('#extension-dashboard-' + grid_id);
			if(gridstack_container == null){
				if(this.debug){
					console.warn("dashboard: show_dashboard: no gridstack container yet");
				}
			}
			
			
			if(gridstack_container){
				
				const tabs_menu_container_el = document.getElementById('extension-dashboard-tab-buttons-container');
				if(tabs_menu_container_el){
					for(let tc = 0; tc < tabs_menu_container_el.children.length; tc++){
						tabs_menu_container_el.children[tc].classList.remove('extension-dashboard-tab-button-selected');
					}
					const tab_button_el = document.querySelector('#extension-dashboard-show-' + grid_id);
					if(tab_button_el){
						tab_button_el.classList.add('extension-dashboard-tab-button-selected'); // while editing, the button may not exist if it has been replaced by an input element
					}
				}
				
				const tabs_container_el = document.getElementById('extension-dashboard-tabs');
				if(tabs_container_el){
					for(let tc = 0; tc < tabs_container_el.children.length; tc++){
						tabs_container_el.children[tc].classList.remove('extension-dashboard-tab-selected');
					}
					document.querySelector('#extension-dashboard-tab-' + grid_id).classList.add('extension-dashboard-tab-selected');
				}
				
				gridstack_container.innerHTML = '';
				
				this.grids[grid_id] = GridStack.addGrid(gridstack_container, this.dashboards[grid_id]['gridstack']);
				this.current_grid = this.grids[grid_id];
				
				if(this.editing == false){
					//this.dashboards[grid_id]['gridstack']['static'] = true;
					this.grids[grid_id].setStatic(true);
				}
				
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
						if(this.debug){
							console.error("dashboard: invalid widget_id: ", widget_id);
						}
					}
				}
				
				
			    this.current_grid.on('added removed change', (e, items) => {
					let str = '';
					if(this.debug){
						console.log("dashboard debug: gridstack changed.  event,items: ", e, items);
					}
					
					items.forEach(function(item) { str += ' (x,y)=' + item.x + ',' + item.y; });
					if(this.debug){
						console.log("dashboard debug:" , e.type + ' ' + items.length + ' items:' + str );
					}
					if(e.type == 'removed'){
						document.getElementById('extension-dashboard-trash').classList.remove('extension-dashboard-drag-over-scale');
						
						for(let ri = 0; ri < items.length; ri++){
							//console.log("removed item: ", items[ri]);
							if(typeof items[ri]['id'] == 'string' && items[ri]['id'].startsWith('widget')){
								const removed_widget_id = items[ri]['id'];
								if(typeof this.current_grid_id == 'string' && typeof this.dashboards[this.current_grid_id] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'][removed_widget_id] != 'undefined'){
									//console.log("removing widget data from this.dashboards: ", removed_widget_id, JSON.stringify(this.dashboards[this.current_grid_id]['widgets'][removed_widget_id],null,4));
									delete this.dashboards[this.current_grid_id]['widgets'][removed_widget_id];
								}
							}
						}
						
					}
					else if(e.type == 'change' && this.editing){
						
						//console.log("gridstack items changed: ", items);
						let should_redraw_logs = false;
						for(let ri = 0; ri < items.length; ri++){
							//console.log("changed: ", items[ri]);
							if(typeof items[ri]['id'] == 'string' && items[ri]['id'].startsWith('widget')){
								const changed_widget_id = items[ri]['id'];
								//console.log("changed_widget_id: ", changed_widget_id);
								if(typeof this.current_grid_id == 'string' && typeof this.dashboards[this.current_grid_id] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'][changed_widget_id] != 'undefined'){
									if(this.debug){
										console.log("widget data from this.dashboards for the widget that was changed: ", changed_widget_id, JSON.stringify(this.dashboards[this.current_grid_id]['widgets'][changed_widget_id],null,4));
									}
									if(typeof this.dashboards[this.current_grid_id]['widgets'][changed_widget_id]['type'] == 'string' && this.dashboards[this.current_grid_id]['widgets'][changed_widget_id]['type'] == 'log'){
										should_redraw_logs = true;
										//console.log("should redraw logs");
										
									}
								}
							}
							
						}
						if(should_redraw_logs){
							//console.log("at least one log widget changed. But did it's size change? Hmm.");
							this.render_logs(false);
						}
						
					}
			    });
				
				this.update_clocks();
				
				
				
				
				// SHOW DASHBOARD: MANAGE WEBSOCKETS
				
				// Find out which websockets need to be opened
				this.currently_relevant_thing_ids = [];
				if(typeof this.dashboards[this.current_grid_id] == 'undefined'){
					this.dashboards[this.current_grid_id] = {'widgets':{}}
				}
				for (const [widget_id, details] of Object.entries( this.dashboards[this.current_grid_id]['widgets'] )) {
					if(details && typeof details['needs'] != 'undefined' && typeof details['needs']['update'] != 'undefined'){
						const needs_update = details['needs']['update'];
						for (const [what_property_is_needed, needs_update_details] of Object.entries( needs_update )) {
							if(typeof needs_update_details['thing_id'] == 'string' && typeof needs_update_details['property_id'] == 'string'){
								if(this.currently_relevant_thing_ids.indexOf(needs_update_details['thing_id']) == -1){
									this.currently_relevant_thing_ids.push(needs_update_details['thing_id']);
								}
							}
						}
					}
				}
				if(this.debug){
					console.log("dashboard debug: show_dashboard:  this.currently_relevant_thing_ids is now: ", this.currently_relevant_thing_ids);
				}
				
				
				
				
				// Disconnect all the existing websockets, so that when the relevant ones are reconnected or opened, we'll get fresh data about their property values
				for (const [websocket_thing_id, websocket_client] of Object.entries( this.websockets )) {
					if(this.debug){
						console.log("dashboard debug: closing websocket for websocket_thing_id: ", websocket_thing_id);
					}
					if(websocket_client){
						websocket_client.close(); // the onclose event handler might re-open the websocket immediately.
						//delete this.websockets[websocket_thing_id];
						/*
						setTimeout(() => {
							delete this.websockets[websocket_thing_id];
							console.log("closed and deleted websocket client for ", websocket_thing_id);
						},950);
						*/
						
					}
					else{
						console.error("dashboard debug: websocket_client was invalid? ", typeof websocket_client, websocket_client);
					}
				}
				
				
				
				
				
				// Create websocket clients for any things that don't have them yet
				this.connect_websockets();
				
				this.render_logs(switched_to_other_dashboard);
				
				setTimeout(() => {
					this.update_moon();
				},1000);
				
			}
			else{
				if(this.debug){
					console.error("no gridstack container element found for grid_id: ", grid_id);
				}
			}
		    
			
		}


		// Adds a widget to the current dashboard. 
		// TODO In theory adding a 'sub-widget', which acts like a widget container, could also be implemented
	    add_main_widget(grid_id=null) {
			if(grid_id == null){
				grid_id = this.current_grid_id;
			}
			
			//console.log("in add_main_widget.  grid_id: ", grid_id);
			if(typeof grid_id != 'string'){
				if(this.debug){
					console.error("dashboard: add_main_widget: no valid grid_id: ", grid_id);
				}
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
						if(this.debug){
							console.error("dashboard: found widget element, but could not find widget content element: " + grid_id + '-' + widget_id);
						}
						
					}
					
				}
				//console.log("brand_new_widget_el?: ", brand_new_widget_el);
			}
			else{
				if(this.debug){
					console.error("dashboard: could not add widget to non-existing grid with  grid_id: ", grid_id);
				}
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
				if(this.debug){
					console.warn("dashboard: set_highlighted_modal_template: no valid widget_id provided/available");
				}
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
					setTimeout(() => {
						//console.log("calling scrollIntoView for selected template: ", template_els[tc]);
						template_els[tc].scrollIntoView({ behavior: "smooth", block: "start", inline: "start"});
					},50)
					
				}
				else{
					template_els[tc].classList.remove('extension-dashboard-widget-modal-highlighted-template');
				}
				
			}
			
			return widget_type;
		}
		
	   
	    save_grid(grid_id=null, content=false, full=true) {
			//console.log("in save_grid");
			
			if(grid_id== null){
				grid_id = this.current_grid_id;
			}
			if(typeof this.grids[grid_id] == 'undefined'){
				this.grids[grid_id] = {};
			}
			if(typeof this.grids[grid_id] != 'undefined' && typeof this.grids[grid_id].save != 'undefined'){
				this.dashboards[grid_id]['gridstack'] = this.grids[grid_id].save(content, full);
			}
			
			
            window.API.postJson(
                `/extensions/${this.id}/api/ajax`, {
                    'action': 'save',
					'dashboards':this.dashboards
                }
            ).then((body) => {
                if (this.debug) {
					console.log("\ndashboard debug: saved dashboards to backend\n");
				}
			
            }).catch((e) => {
                if (this.debug) {
					console.error("Dashboard: caught error saving dashboards to backend: ", e);
				}
            });
			
			this.connect_websockets();
			
	    }


		connect_websockets(){
			if(this.debug){
				console.log("dashboard debug: in connect_websockets")
			}
			
			if(typeof this.dashboards[this.current_grid_id] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'] != 'undefined'){
				//console.log("widgets data for this grid_id: ", this.dashboards[this.current_grid_id]['widgets']);
				
				//let currently_relevant_thing_ids = [];
				this.websockets_lookup = {};
				
				class WebSocketClient {
				  constructor(url, thing_id, options = {}) {
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
					this.connecting = false;
					this.thing_id = thing_id;

				    this.connect();
				  }

				  connect() {
					  //console.error("websocket client: in connect().  this.thing_id: ", this.thing_id);
					  if(this.connecting == true){
						  console.error("websocket client: already busy connecting!  this.thing_id: ", this.thing_id);
						  return
					  }
					  this.connecting = true;
				    //console.log(`Connecting to ${this.url}...`);
				    try {
				      this.ws = new WebSocket(this.url);
				      this.setupEventHandlers();
				    } catch (error) {
				      console.error('dashboard: failed to create WebSocket:' + error);
				      this.scheduleReconnect();
				    }
				  }

				  setupEventHandlers() {
				    this.ws.onopen = (event) => {
				      //console.log('WebSocket connected');
				      this.isConnected = true;
					  this.connecting = false;
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
				      //console.error('dashboard: WebSocket error:', error);
				      this.trigger('error', error);
				    };

				    this.ws.onclose = (event) => {
				      //console.log(`dashboard: WebSocket closed: ${event.code} - ${event.reason}`, event);
				      this.isConnected = false;
					  this.connecting = false;
				      this.stopHeartbeat();

					  event['thing_id'] = this.thing_id;
				      // Trigger custom close handlers
				      this.trigger('close', event);

				      // Attempt to reconnect if not a normal closure
				      if (event.code !== 1000 && event.code !== 1001) {
						//console.warn("websocket client: unexpected connection closure");
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
				      //console.error('dashboard: WebSocket not connected, queuing message');
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
				            console.log('Dashboard: websocket client: heartbeat timeout, reconnecting...');
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
				      //console.error('Dashboard: wesocket max reconnection attempts reached');
				      this.trigger('maxReconnectAttemptsReached');
				      return;
				    }

				    this.reconnectAttempts++;
				    const delay =
				      this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
					  //console.warn(`Dashboard: websocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

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
				          //console.error(`Dashboard: Error in ${event} handler:`, error);
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
						for (const [what_property_is_neededX, needs_update_detailsX] of Object.entries( needs_update )) {
							//console.log("what_property_is_needed: ", what_property_is_needed);
							//console.log("- needs_update_details: ", needs_update_details);
							
							const what_property_is_needed = what_property_is_neededX;
							const needs_update_details = needs_update_detailsX;
							
							if(typeof needs_update_details['thing_id'] == 'string' && typeof needs_update_details['property_id'] == 'string'){
								
								const thing_id = needs_update_details['thing_id'];
								const property_id = needs_update_details['property_id'];
								
								/*
								if(currently_relevant_thing_ids.indexOf(thing_id) == -1){
									currently_relevant_thing_ids.push(thing_id); // TODO: this.websockets_lookup does basically the same..
								}
								*/
								
								
								if(typeof this.websockets_lookup[thing_id] == 'undefined'){
									this.websockets_lookup[thing_id] = [];
								}
								if(this.websockets_lookup[thing_id].indexOf(property_id) == -1){
									this.websockets_lookup[thing_id].push(property_id);
								}
								
								
								if(typeof this.websockets[thing_id] != 'undefined'){
									//console.log("the websocket client already exists:  thing_id,client: ", thing_id, this.websockets[thing_id]);
									if(this.currently_relevant_thing_ids.indexOf(thing_id) != -1){
										//console.error("could reconnect to websocket... for thing_id: ", thing_id, "\n -- connecting: ", this.websockets[thing_id].connecting, "\n -- isConnected: ", this.websockets[thing_id].isConnected );
										if(this.websockets[thing_id].connecting == false && this.websockets[thing_id].isConnected == false){
											this.websockets[thing_id].connect();
										}
										else{
											//console.log("... but the websocket is already on it?")
										}
									}
								
								
								}
								//if(typeof this.websockets[thing_id] == 'undefined'){
								else{
								
									
									let port = 8080;
									if (location.protocol == 'https:') {
										port = 443;
									}
					
									const thing_websocket_url = 'ws://' + window.location.hostname + ':' + port + '/things/' + thing_id + '?jwt=' + window.API.jwt; // /properties/temperature
									//console.log("generate_widget_content: creating new websocket client:  new thing_websocket_url: ", thing_websocket_url);
					
									this.websockets[ thing_id ] = new WebSocketClient(thing_websocket_url, thing_id);
					
									const client = this.websockets[ thing_id ];
									//console.log("new client: ", client);
					
									client.on('open', () => {
										if(this.debug){
											console.warn('\n\ndashboard debug: a websocket is connected and ready.  thing_id: ' + client.thing_id + '\n\n');
										}
									});


									client.on('error', (error) => {
										if(this.debug){
											console.error('dashboard debug: websocket connection error:', error);
										}
										setTimeout(() => {
											client.scheduleReconnect();
										},2000);
									});

									client.on('close', (event) => {
									  if(this.debug){
										  console.warn('dashboard debug: WEBSOCKET CLOSED:', event.code, event.reason, event.thing_id);
									  }
									  if(event.code != 1000){
										  if(this.debug){
											  console.error("dashboard debug: websocket client close seems unexpected. Will attempt to re-open it in a few seconds");
										  }
										  setTimeout(() => {
											  client.scheduleReconnect();
										  },5000 + (Math.floor(Math.random() * 1000)));
									  }
									  else if(typeof event.thing_id == 'string'){
										  //console.log("websocket just closed, and it provided a thing_id so that it can potentially be re-opened: ", event.thing_id);
										  if(typeof this.websockets[event.thing_id] != 'undefined'){
											  if(this.debug){
												  //console.log("dashboard debug: websocket was closed. thing_id: ", event.thing_id);
											  }
											  
											  if(this.currently_relevant_thing_ids.indexOf(event.thing_id) != -1){
												  if(this.debug){
													  console.log("dashboard debug: telling existing websocket client to immediately reconnect for still_relevant thing_id: ", event.thing_id);
												  }
												  try{
													  if(client.connecting == false && client.isConnected == false){
														  if(this.debug){
															  console.log("dashboard debug: CALLING Websocket CLIENT.CONNECT after it was closed");
														  }
														  client.connect();
													  }
													  else{
														  if(this.debug){
															  console.error("\ndashboard debug:  END.\n\nre-opening websocket after close: something beat me to it?");
														  }
													  }
													  
												  }
												  catch(err){
													  if(this.debug){
														  console.error("dashboard debug: caught error trying to re-connect to websocket client: ", err);
													  }
												  }
											  }
											  else{
												  if(this.debug){
													  console.log("\ndashboard debug: END.\n\n websocket closed, and thing_id is no longer relevant: ", event.thing_id);
												  }
											  }
											  
										  }
										  else{
											  if(this.debug){
												  console.error("dashboard debug: websocket that just closed no longer exists in this.websockets? ", event.thing_id, this.websockets);
											  }
										  }
										  //console.warn("HURRAY, received thing_id from websocket client that finished closing: ", event.thing_id);
									  }
									});
									

									client.on('message', (data) => {
										if(this.debug){
											console.log('\n\n\ndashboard debug: websocket received:', JSON.stringify(data,null,2));
										}
										
										if(typeof this.websockets_lookup[thing_id] != 'undefined'){
											if(this.debug){
												console.log("dashboard debug: in theory these properties could be updated in the dashboard, according to this.websockets_lookup: ", this.websockets_lookup[thing_id]);
											}
										}
										
										if(this.view && this.content && typeof data['id'] == 'string' && data['id'] == thing_id && typeof data['messageType'] == 'string' && data['messageType'] == 'propertyStatus' && typeof data['data'] != 'undefined'){
											//console.log(" -- the websocket message contains a propertyStatus");
												
												
											if(this.debug){
												console.log("dashboard debug: as expected, received a websocket message for this thing: " + thing_id + " with keys: " + JSON.stringify(Object.keys(data['data'])));
											}
											for (let [property_id, property_value] of Object.entries( data['data'] )) {
												
												if(typeof this.recent_events[thing_id] == 'undefined'){
													this.recent_events[thing_id] = {};
												}
												if(typeof this.recent_events[thing_id][property_id] != 'undefined' && this.recent_events[thing_id][property_id]['timestamp'] > Date.now() - 1000){
													if(this.debug){
														console.warn("dashboard debug: info: received a websocket message that is already in recent_events: ", property_id, property_value, ", vs recent event: ", JSON.stringify(this.recent_events[thing_id][property_id],null,4));
													}
													if(this.recent_events[thing_id][property_id]['value'] == property_value){
														if(this.debug){
															console.warn("dashboard debug:  > > > and the value matches too: ", property_value);
														}
														//this.recent_events[thing_id][property_id]['timestamp'] = Date.now();
														//continue
													}
												}
												else{
													this.recent_events[thing_id][property_id] = {"timestamp":Date.now(), "value":property_value, "type":"received"};
												}
												
												
												
												//let elements_to_update = this.view.querySelectorAll('[data-extension-dashboard-update-thing="' + thing_id + '"][data-extension-dashboard-update-property="' + property_id + '"]');
												let elements_to_update = this.view.querySelectorAll('[data-extension-dashboard-update-thing-combo="' + thing_id + '--x--' + property_id + '"]');
												
												/*
												if(elements_to_update.length == 0){
													if(this.debug){
														console.warn("DID NOT FIND ANY ELEMENT TO UPDATE WITH NEW VALUE: ", thing_id, property_id, property_value);
													}
												}
												*/
												
												
												if(this.debug){
													console.warn("dashboard debug: incoming websocket message -> elements_to_update: ", elements_to_update);
													//console.warn("dashboard debug: incoming websocket message -> elements_to_update count for thing_id,property_id: ", elements_to_update.length, thing_id, property_id);
												}
												
												
												
												for(let eu = 0; eu < elements_to_update.length; eu++){
													
													const el_to_update = elements_to_update[eu];
													
													//console.error("\nel_to_update # " + eu);
													
													try{
														//console.log("\nel_to_update: ", el_to_update.tagName, el_to_update);
													
													
												
													
												
													
														//
														//   OPTIMIZE THE RECEIVED VALUE FOR IT'S INTENDED TARGET ELEMENT
														//
													
													
													
														// Special case: if the internet radio sends a 'none' value for the artist or song, force it to be empty instead.
														if(typeof property_value == 'string' && property_value == 'None' && thing_id == 'internet-radio' && (property_id == 'artist' || property_id == 'song')){
															//console.warn("SETTING INCOMING INTERNET RADIO VALUE TO EMPTY STRING: ", property_value);
															property_value = '';
														}
													
													
														// Adjust the decimals if the target element has a 'step' attribute
													
														// New value is not a number
														if((typeof property_value == 'string' && property_value == "") || typeof property_value == 'boolean' || typeof property_value == 'object' || isNaN('' + property_value)){
															if(this.debug){
																console.log("dashboard debug: the incoming value is not a number, so no need to clean it: ", typeof property_value, property_value);
															}
														}
													
														// If the provided value is a number, clean it up to match any 'step' attribute that element it will be placed into may have
														else{
														
															if(this.debug){
																console.log("dashboard debug: incoming value seems to be a number: ", property_value);
															}
														
															let new_value = parseInt(property_value);
												
															if('' + new_value != '' + property_value){
																//console.log("parseInt value was not the same as the original value: " + new_value + " =?= " + property_value);
																new_value = parseFloat(property_value);
															
															
																//console.log("initial new_value: ", typeof new_value, new_value);
																if(Math.abs(new_value) % 0.001 > 0){
																	//new_value = (new_value - (new_value % 0.001));
																	new_value = Math.round(new_value*1000)/1000;
																	if(this.debug){
																		//console.log("dashboard debug: initial new_value after quick adjustment to maximum of three decimals: ", new_value);
																	}
																}
													
											
											
																let input_step_raw = el_to_update.getAttribute('step');
																if(this.debug){
																	console.log("dashboard debug: input_step_raw: ", typeof input_step_raw, input_step_raw);
																}
											
																if(typeof input_step_raw == 'string' && !isNaN(parseFloat(input_step_raw))){
																	if(this.debug){
																		console.log("dashboard debug: input element seemed to have a valid step attribute: ", input_step_raw);
																	}
																	let input_step = parseInt(input_step_raw);
																	if(('' + input_step != '' + input_step_raw) || (parseFloat(input_step_raw) > 0 && parseFloat(input_step_raw) < 0.9)){
																		input_step = parseFloat(input_step_raw);
																		if(this.debug){
																			console.log("dashboard debug: step seems to be a float: " + input_step);
																		}
																	}
												
																	if(typeof input_step == 'number' && input_step != 0){
																		if(Math.abs(new_value) % input_step > 0){
																			if(this.debug){
																				console.log("dashboard debug: value did not conform to step: " + new_value, input_step);
																			}
																			//new_value = (new_value - (new_value % input_step));
																			let below_zero_flipper = 1;
																			if(new_value < 0){
																				below_zero_flipper = -1;
																			}
																			if(input_step < 0.01){
																				new_value = Math.round(Math.abs(new_value)*1000)/1000;
																			}
																			else if(input_step < 0.1){
																				new_value = Math.round(Math.abs(new_value)*100)/100;
																			}
																			else if(input_step < 1){
																				new_value = Math.round(Math.abs(new_value)*10)/10;
																			}
																			else if(input_step < 10){
																				new_value = Math.round(Math.abs(new_value));
																			}
																			if(below_zero_flipper < 0){
																				if(this.debug){
																					console.log("dashboard debug: flipping value back to negative");
																				}
																				new_value = new_value * below_zero_flipper;
																			}
														
																			if(this.debug){
																				console.log("dashboard debug: value should conform to step now: " + new_value, input_step);
																			}
																		}
													
																	}
												
																}
														
																if(!isNaN("" + new_value)){
																	if(this.debug){
																		console.log("NUMBER CLEANING COMPLETE. CHANGE: ", typeof property_value, property_value, " ->> ", typeof new_value, new_value);
																	}
																}
															
															}
															if(!isNaN("" + new_value)){
																property_value = new_value;
															}
														
														
														}
													
													
														//console.log("next..  el_to_update.tagName: ", el_to_update.tagName);
														
														
														//
														//  UPDATE LIST SELECTOR
														//
														
														if(el_to_update.tagName == 'UL'){
														
															if(this.debug){
																console.log("dashboard debug: attempting to updated highlighted item in list: ", typeof property_value, property_value);
															}
															
															for(let li = 0; li < el_to_update.children.length; li++){
																if(el_to_update.children[li].textContent == '' + property_value){
																	//console.log("FOUND THE LIST ITEM TO HIGHLIGHT: ", property_value);
																	el_to_update.children[li].classList.add('extension-dashboard-widget-list-selector-highlighted-item');
																}
																else{
																	el_to_update.children[li].classList.remove('extension-dashboard-widget-list-selector-highlighted-item');
																}
															}
															
															//el_to_update.value = '' + property_value;
														
														
														}
														
														//
														//  UPDATE SELECT OR TEXTAREA
														//
													
														else if(el_to_update.tagName == 'TEXTAREA' || el_to_update.tagName == 'SELECT'){
														
														
															if(this.debug){
																console.log("dashboard debug: attempting to set select or textarea to value: ", typeof property_value, property_value);
															}
															el_to_update.value = '' + property_value;
														
														}
													
													
														//
														//  UPDATE TEXTCONTENT
														//
													
														else if(el_to_update.tagName != 'INPUT'){
														
															if(this.debug){
																console.log("dashboard debug: attempting to set the element's textContent to value: ", typeof property_value, property_value);
															}
															el_to_update.textContent = "" + property_value;
														
														}
													
													
														//
														//  UPDATE INPUT ELEMENT
														//
													
														else{
														
															//console.log("going to update input el");
														
															let input_type = el_to_update.getAttribute('type');
															if(this.debug){
																console.log("dashboard debug: INPUT el to update [type]: ", input_type);
															}
														
															if(typeof input_type != 'string'){
															
																if(this.debug){
																	console.error("dashboard debug: INPUT ELEMENT WITHOUT A TYPE ATTRIBUTE. Will attempt to set it's value to: ", property_value);
																}
																el_to_update.value = property_value;
															
															
															}
															else{
																
																//console.log("GOING TO SET AN INPUT ELEMENT TO: ", typeof property_value, property_value);
																
																input_type = input_type.toLowerCase();
															
																if(input_type == 'checkbox'){
																
																
																	//
																	//  UPDATE CHECKBOX
																	//
																
																	if(typeof property_value != 'boolean'){
																		if(this.debug){
																			console.warn("dashboard debug: user seem to want to update a checkbox using a property that is not a boolean");
																		}
																	}
																
																	if(this.debug){
																		console.log("dashboard debug: setting checkbox to: ", typeof property_value, property_value);
																	}
																	el_to_update.checked = Boolean(property_value);
																
																}
																else if(input_type == 'range' || input_type == 'number'){
																
																	
																	//console.log("OK The input element is a number (or range)");
																	
																	
																	//
																	//  UPDATE NUMBER INPUT
																	//
																
																	if(this.debug){
																		console.log("dashboard debug: setting number or range input to (hopefully) a number value: ", typeof property_value, property_value);
																	}
																	el_to_update.value = property_value;
																
																
																
																	//
																	//  MOVING THE NEEDLE
																	//
													
																	// Some elements have needle to indicate a value (dial, thermostat). Here the dial is found and updated.
																
																	if(typeof property_value == 'number'){
																		const widget_root_el = el_to_update.closest('div.extension-dashboard-template');
																		//console.log("widget_root_el: ", widget_root_el);
																		if(widget_root_el && widget_root_el.getAttribute('data-widget-has-dial')){
																			const widget_needle_el = widget_root_el.querySelector('.extension-dashboard-widget-dial-needle');
																			if(widget_needle_el){
																				//console.log("widget_needle_el: ", widget_needle_el);
																				const minimum_value_el = widget_root_el.querySelector('.extension-dashboard-widget-minimum-value');
																				if(minimum_value_el && minimum_value_el.tagName == 'INPUT'){
																					let minimum_value = parseFloat("" + minimum_value_el.value);
																					//console.log("minimum_value: ", minimum_value);
																					if(typeof minimum_value == 'number' && !isNaN(minimum_value)){
																						const maximum_value_el = widget_root_el.querySelector('.extension-dashboard-widget-maximum-value');
																						if(maximum_value_el && maximum_value_el.tagName == 'INPUT'){
																							let maximum_value = parseFloat("" + maximum_value_el.value);
																							if(typeof maximum_value == 'number' && !isNaN(maximum_value)){
																								const range = maximum_value - minimum_value;
																								if(range != 0){
																									if(this.debug){
																										console.log("dashboard debug: dial range: ", minimum_value, maximum_value, " --> ", range);
																									}
																									if(property_value >= minimum_value && property_value <= maximum_value){
																										//console.log("OK, value is in the range");
																									}
																							
																							
																									let percentage = ((property_value - minimum_value) / range) * 100;
																									//console.log("percentage: ", percentage);
																							
																									if(property_value < minimum_value){
																										//console.log("forcing percentage to 0");
																										percentage = 0;
																									}
																									if(property_value > maximum_value){
																										//console.log("forcing percentage to 100");
																										percentage = 100;
																									}
																							
																									if(percentage < 0){
																										percentage = 0;
																									}
																									else if(percentage > 100){
																										percentage = 100;
																									}
																									if(this.debug){
																										console.log("dashboard debug: percentage for moving needle: ", percentage);
																									}
																									widget_needle_el.setAttribute('style',"transform:rotateZ(" + (180 + (percentage * 1.8)) + "deg);");
																									widget_needle_el.classList.remove('extension-dashboard-hidden');
																									// Also try to update the dial ticks
																									if(Math.abs(range) > 2){
																										const widget_ticks_el = widget_root_el.querySelector('.extension-dashboard-widget-dial-ticks');
																								
																										if(widget_ticks_el){
																											let read_only = false;
																											if(el_to_update.disabled){
																												widget_ticks_el.classList.add('extension-dashboard-widget-dial-disabled');
																												read_only = true;
																											}
																									
																											let modulo_factor = 2; // only a portion of the ticks will have a line on them
																									
																											let do_halves = 1;
																											if(Math.abs(range) < 31){
																												do_halves = 2;
																											}
																											else{
																												modulo_factor = Math.round((Math.abs(range)/2) / 30) * 2; // what modulo to use
																												if(modulo_factor == 0){
																													modulo_factor = 2;
																												}
																											}
																											if(this.debug){
																												console.log("dashboard debug:  do_halves, modulo_factor: ", do_halves, modulo_factor);
																											}
																									
																											let expected_span_els_count = 0;
																											if(read_only){
																												expected_span_els_count = Math.floor((range*do_halves)/modulo_factor) + 1;
																											}
																											else{
																												expected_span_els_count = Math.floor(range*do_halves) + 1;
																											}
																											if(this.debug){
																												console.log("dashboard debug: expected span el count in the dial: ", expected_span_els_count, " vs actual count: ", widget_ticks_el.children.length, ", read_only:", read_only);
																											}
																									
																											if(widget_ticks_el.children.length != expected_span_els_count){
																												if(this.debug){
																													console.log("dashboard debug: re-drawing the dial ticks");
																												}
																												widget_ticks_el.innerHTML = '';
																												let tick_counter = 0;
																												for(let ti = 0; ti <= range * do_halves; ti++){
																													tick_counter++;
																								
																													let uneven = ti % modulo_factor;
																													let tick_el = document.createElement('span');
																													tick_el.setAttribute('style','transform: rotate(' + (180 + ((180 / range) * (ti / do_halves))) + 'deg) translate(480%)'); // rotate(292.5deg) translate(80px) rotate(90deg)
																													if(!uneven){
																														tick_el.textContent = minimum_value + (ti/do_halves);
																														tick_el.classList.add('extension-dashboard-widget-dial-tick-even');
																													}
																													else{
																														tick_el.classList.add('extension-dashboard-widget-dial-tick-uneven');
																													}
																								
																													if(el_to_update.disabled){ // sic, as it could be both false or undefined
																														// not adding a click listener is the attached thing-property is read-only.
																													}
																													else{
																														tick_el.addEventListener('click', () => {
																															if(this.debug){
																																console.log("dashboard debug: dial tick value: ", minimum_value + (ti/do_halves));
																															}
																									
																															let dial_message = {
																																"messageType": "setProperty",
																																//"id":thing_id,
																																"data":{}
																															};
																															dial_message['data'][property_id] = minimum_value + (ti/do_halves);
																									
																															this.websockets[thing_id].send(dial_message);
																								
																														});
																													}
																											
																													if(read_only && uneven){ 
																														// do not add an invisible tick if it can't be clicked anyway
																													}
																													else{
																														widget_ticks_el.appendChild(tick_el);
																													}
																												}
																							
																												//console.log("tick_counter: ", tick_counter, (range*2) + 1);
																											}
																										}
																									}
																			
																								}
																							}
																						}
																					}
												
																				}
											
																			}
																		}
																	}
																
													
																}
																else{
																	//console.log("OK, setting an input element's value to: ", property_value);
																	el_to_update.value = property_value;
																}
															}
														
															if(el_to_update.classList.contains('extension-dashboard-widget-adjust-width-to-input-length')){
																el_to_update.style.width = (el_to_update.value.length) + "ch";
															}
															
															//const change_event = new Event('change');
															//el_to_update.dispatchEvent(change_event);
														
														}
													}
													catch(err){
														console.error("caught error while tryig to update element: ", err);
													}
													
													
												}
												
												
												
												
												
												
												//
												//  WEATHER ANIMATIONS
												//
												
												// If this websocket message is for a weather widget, then check if it contains a weather prediction.
												// If it does, use that to set some CSS classes for fancy animations
												//console.log("this.animations: ", this.animations);
												
												if(this.animations && elements_to_update.length){
													
													// Loop over all widgets in the current dashboard until we find a match. 
													// We need to look up to see if a thing-property is set for, for example, the weather widget's description. 
													// And then check if that matches with the received thing-property combo.
													
													if(typeof this.dashboards[this.current_grid_id] != 'undefined' && typeof this.dashboards[this.current_grid_id]['widgets'] != 'undefined'){
														for (const [widget_id, widget_details] of Object.entries(this.dashboards[this.current_grid_id]['widgets'])) {
															//console.log("checking widget: ", widget_id);
															if(typeof this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs'] != 'undefined'){
																//console.log("this widget has needs: ", this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']);
																//const needs = this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs'];
																if(typeof this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['update'] != 'undefined'){
																	//console.log("this widget has update needs: ", this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['update']);
																	
																	for (const [what_property_is_needed2, needs_update_details2] of Object.entries( this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['update'] )) {
																		//console.log("looping over needs for this dashboard. widget -> update -> what_property_is_needed:\n", widget_id, what_property_is_needed, needs_update_details);
																		//console.log(" ... looking for: ", thing_id, property_id);
																		
																		
																		//console.log(needs_update_details2['thing_id'], " =?= ", thing_id);
																		//console.log(needs_update_details2['property_id'], " =?= ", property_id);
																		
																		if(needs_update_details2['thing_id'] == thing_id && needs_update_details2['property_id'] == property_id){
																			
																			//console.warn("OK MATCHING");
																			
																			/*
																			if(this.debug){
																				console.error("dashboard debug: OK, found a widget that uses the thing_id and property_id from the incoming websocket update message. All variables: \n__grid_id: ", grid_id, "\n__widget_id: ", widget_id, "\n__thing_id:", thing_id, "__property_id:", property_id);
																			}
																			*/
																			
																			
																			
																			//
																			// SPECIALS
																			//
																			
																			// WEATHER
																			
																			// First, double-check that the message is a weather update, and that the widget we're looking at is a weather widget
																			//console.log("checking for specials");
																			if(
																				// It's a weather widget
																				typeof this.dashboards[this.current_grid_id]['widgets'][widget_id]['type'] == 'string' &&
																				this.dashboards[this.current_grid_id]['widgets'][widget_id]['type'] == 'weather' && 
																				
																				// The widget indeed needs a weather description update
																				what_property_is_needed2 == 'weather_description' && 
																				
																				// The incoming websocket update is a from a Candle Weather addon thing
																				thing_id == 'candle-weather-today' &&
																				// And it's delivering a weather description property update
																				property_id == 'current_description' && 
																				
																				// Just to be absurdly sure, there is (still) content to update CSS classes for, right?
																				this.content_el &&
																				
																				// And weather widget animations are allowed?
																				this.animations
																				
																		
																			){
																				//console.log("dashboard debug: FULL WEBSOCKET + WEATHER WIDGET MATCH");
																				
																			
																				this.content_el.classList.remove('extension-dashboard-widget-weather-show-rain');
																				this.content_el.classList.remove('extension-dashboard-widget-weather-show-rain-impact');
																				this.content_el.classList.remove('extension-dashboard-widget-weather-show-clouds');
																				this.content_el.classList.remove('extension-dashboard-widget-weather-show-dark-clouds');
																				this.content_el.classList.remove('extension-dashboard-widget-weather-show-snow');
																				this.content_el.classList.remove('extension-dashboard-widget-weather-show-hail');
																				this.content_el.classList.remove('extension-dashboard-widget-weather-show-fog');
																			
																				setTimeout(() => {
																					if(property_value.toLowerCase().indexOf('storm') != -1){
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-rain');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-rain-impact');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-clouds');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-dark-clouds');
																						if(this.debug){
																							console.log("dashboard debug: weather update: storm: ", property_value);
																						}
																					}
																					else if(property_value.toLowerCase().indexOf('rain') != -1){
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-rain');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-clouds');
																						if(this.debug){
																							console.log("dashboard debug: weather update: rain: ", property_value);
																						}
																					}
																					else if(property_value.toLowerCase().indexOf('cloud') != -1){
																						if(this.debug){
																							console.log("dashboard debug: weather update: cloudy: ", property_value);
																						}
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-clouds');
																					}
																					else if(property_value.toLowerCase().indexOf('snow') != -1){
																						if(this.debug){
																							console.log("dashboard debug: weather update: snowy: ", property_value);
																						}
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-clouds');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-snow');
																					}
																					else if(property_value.toLowerCase().indexOf('hail') != -1){
																						if(this.debug){
																							console.log("dashboard debug: weather update: hail: ", property_value);
																						}
																						// fast moving snow with an impact animation
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-clouds');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-dark-clouds');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-snow');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-hail');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-rain-impact');
																					}
																					else if(property_value.toLowerCase().indexOf('fog') != -1 || property_value.toLowerCase().indexOf('mist') != -1){
																						if(this.debug){
																							console.log("dashboard debug: weather update: fog: ", property_value);
																						}
																						// fast moving snow with an impact animation
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-clouds');
																						this.content_el.classList.add('extension-dashboard-widget-weather-show-fog');
																					}
																				},10);
																				
																			
																	
																			}
																			
																		}
																		
																		
																		
																	}
																}
																
															}
															
														}
													}
													
												} // end of weather animations
												
												
												
												
											}
										}
										
									});

									
								}
							}
							
						}
						
						
					}
					
				}
				
				
				// Disconnect all the websockets that are no longer relevant (every thing_id from the lookup table that is not in the current grid_id)
				
				for (const [websocket_thing_id, websocket_client] of Object.entries( this.websockets )) {
					if(this.debug){
						//console.log("dashboard debug: checking if websocket is still needed for: ", websocket_thing_id, " in this.currently_relevant_thing_ids?: ", this.currently_relevant_thing_ids);
					}
					
					if(websocket_client){
						//websocket_client.close();
						//delete this.websockets[websocket_thing_id];
						
					}
					else{
						//console.error("dashboard debug: websocket_client was invalid? ", typeof websocket_client, websocket_client);
					}
					
					/*
					if(currently_relevant_thing_ids.indexOf(websocket_thing_id) == -1){
						if(this.debug){
							console.log("dashboard debug: open websockets is no longer needed for this thing_id: ", websocket_thing_id);
						}
					}
					else{
						if(this.debug){
							console.log("dashboard debug: OK, websocket is still useful for thing_id: ", websocket_thing_id);
						}
					}
					*/
				}
				
				//console.log("connect_websockets: this.websockets is now: ", this.websockets);
				
			}
		}







		generate_widget_content(grid_id=null, widget_id=null, widget_type=null){
			if(this.debug){
				console.log("dashboard_debug: in generate_widget_content.  grid_id, widget_id, widget_type");
			}
			
			if(typeof grid_id != 'string' || typeof widget_id != 'string'){
				if(this.debug){
					console.error("dashboard: generate_widget_content: no valid grid_id and/or widget_id provided: ", grid_id, widget_id);
				}
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
				if(this.debug){
					console.log("dashboard: generate_widget_content: no widget_type set yet");
				}
			}
			
			/*
			let widget_icon = null;
			if(typeof this.dashboards[grid_id]['widgets'][widget_id]['icon'] == 'string'){
				widget_icon = this.dashboards[grid_id]['widgets'][widget_id]['icon'];
			}
			*/
			
			// This dictionary will be filled based on the html contents of the template, and then used to generate the template's UI in the widget edit modal
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
				
							if(widget_type == 'clock'){
								if(this.debug){
									console.log("dashboard debug: spotted a clock widget");
								}
								this.update_clock = true; // it seems this dashboard has a clock on it
							}
				
							clone = template.cloneNode(true);
							clone.removeAttribute('id');
							
							if(clone){
								//console.log("created clone");
								widget_content_el.appendChild(clone);
							}
							
							
							let child_els = clone.querySelectorAll('*');
				
							let spotted_thing_title = null;
							
							let last_spotted_input_el = null;
							let last_spotted_number_input_el = null;
							
							let last_spotted_needle_el = null;
							
				
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
							
										if(class_name.endsWith('-remove-me')){
											child_els[ix].remove();
										}
										
										if(class_name.endsWith('-needle')){
											last_spotted_needle_el = child_els[ix];
										}
							
										
										
										//
										//   NEEDS ACTION
										//
										
										if(class_name.indexOf('-needs-action') != -1){
								
											let what_action_is_needed = class_name.replaceAll('-needs-action','');
											what_action_is_needed = what_action_is_needed.replaceAll('extension-dashboard-widget-','');
											//console.log("generate_widget_content: what_action_is_needed: ", what_action_is_needed);
								
											if(typeof needs['action'] == 'undefined'){
												needs['action'] = {};
											}
											
											// No thing-action set for this widget value yet
											if(typeof needs['action'][what_action_is_needed] == 'undefined'){
							
												needs['action'][what_action_is_needed] = {};
												
												
											}
											else{
												//console.log("action needs exists");
												
												if(typeof needs['action'][what_action_is_needed]['thing_id'] == 'string' && typeof needs['action'][what_action_is_needed]['action_id'] == 'string'){
													//console.log("nice, this part of the template it already connected to a thing-action combo");
													child_els[ix].setAttribute('data-extension-dashboard-action-thing', needs['action'][what_action_is_needed]['thing_id']);
													child_els[ix].setAttribute('data-extension-dashboard-action-id', needs['action'][what_action_is_needed]['action_id']);
													//child_els[ix].setAttribute('data-extension-dashboard-update-thing-combo', needs['update'][what_property_is_needed]['thing_id'] + '--x--' + needs['update'][what_property_is_needed]['property_id'] );
													
													const action_thing_id = needs['action'][what_action_is_needed]['thing_id'];
													const action_id = needs['action'][what_action_is_needed]['action_id'];
													
													//console.log("ACTION!  action_thing_id, action_id", action_thing_id, action_id);
													
													child_els[ix].addEventListener('click', () => {
														//console.log("clicked on action button. websocket client?", typeof this.websockets[action_thing_id]);
														
														
														if(typeof this.websockets[action_thing_id] != 'undefined'){
															try{
																
																let outgoing_message = {
																  "messageType": "requestAction",
																  "data": {}
																}
        														
																outgoing_message['data'][action_id] = {}
																
																/*
																// Example
																{
																  "messageType": "requestAction",
																  "data": {
																    "goForward": {},
																  }
																}
																*/
																//console.log("outgoing_message: ", outgoing_message);
																//console.log("client connecting: ", this.websockets[action_thing_id].connecting);
																//console.log("client isConnected: ", this.websockets[action_thing_id].isConnected);
																
																// SENDING ACTION REQUEST VIA WEBSOCKET
														
																if(this.websockets[action_thing_id].isConnected == false && this.websockets[action_thing_id].connecting == false){
																	if(this.debug){
																		console.warn("dashboard debug: unexpectedly had to re-connect the websocket client on action button click for thing_id: ", thing_id);
																	}
																	this.websockets[action_thing_id].connect();
																}
																
																if(this.debug){
																	console.log("sending action request via websocket client: ", outgoing_message);	
																}
																this.websockets[action_thing_id].send(outgoing_message);
																
															}
															catch(err){
																if(this.debug){
																	console.error("dashboard debug: caught error trying to send message via websocket: ", err);
																}
															}
														}
														else{
															if(this.debug){
																console.error("dashboard debug: no websocket for thing_id (yet)");
															}
														}
														
														
														
														
														
													});
													
													
												}
												
												
											}
							
										
										
										}
										
										
										//
										//  NEEDS UPDATE
										//
										
										
										
										if(class_name.indexOf('-needs-update') != -1){
								
											let what_property_is_needed = class_name.replaceAll('-needs-update','');
											what_property_is_needed = what_property_is_needed.replaceAll('extension-dashboard-widget-','');
											//console.log("generate_widget_content: what_property_is_needed: ", what_property_is_needed);
								
											if(typeof needs['update'] == 'undefined'){
												needs['update'] = {};
											}
											
											
											// No thing-property set for this widget value yet
											if(typeof needs['update'][what_property_is_needed] == 'undefined'){
							
												needs['update'][what_property_is_needed] = {"restrictions":{"element_tag_name":child_els[ix].tagName}};
							
												// What kind of thing property should be connected to this template's html?
												if(child_els[ix].tagName == 'INPUT'){
													last_spotted_input_el = child_els[ix];
													const input_el_type = child_els[ix].getAttribute('type');
													if(typeof input_el_type == 'string'){
														
														// TODO: these restrictions are currently not used to optimize the thing-property selector
														needs['update'][what_property_is_needed]['restrictions']['input_type'] = input_el_type;
												
														if (input_el_type == 'text'){
															child_els[ix].value = '';
														}
														else if(input_el_type == 'color'){
															//console.warn("new: color needs update");
														}
														else if(input_el_type == 'number' || input_el_type == 'range'){
															last_spotted_number_input_el = child_els[ix];
															//console.log("generate_widget_content: fresh last_spotted_number_input_el is now: ", last_spotted_number_input_el);
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
														if(this.debug){
															console.error("dashboard: generate_widget_content: could not set textContent of this element: ", child_els[ix]);
														}
													}
											
												}
												
											}
											
											// There is thing-property information, so this widget aspect can be rendered fully
											else{
												
												//console.warn("generate_widget_content: there is some needs data already: ", needs['update'][what_property_is_needed]);
												
												
												// Add some special UI rendering to some input types, like color
												
												const input_el_type = child_els[ix].getAttribute('type');
												if(typeof input_el_type == 'string'){
											
													if(input_el_type == 'number' || input_el_type == 'range'){
														last_spotted_number_input_el = child_els[ix];
														//console.log("last_spotted_number_input_el is now: ", last_spotted_number_input_el);
														
														/*
														child_els[ix].addEventListener('change', (event) => {
															event.preventDefault();
															console.log("input element was changed.  what_property_is_needed,element: ", what_property_is_needed, child_els[ix]);
														});
														child_els[ix].addEventListener('input', (event) => {
															event.preventDefault();
															console.log("input element got input.  what_property_is_needed,element: ", what_property_is_needed, child_els[ix]);
														});
														*/
													}
													
													else if(input_el_type == 'color'){
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
															if(canvas.width > 10 && canvas.height > 10){
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
														  const x = e.clientX - rect.left;
														  const y = e.clientY - rect.top;
														  ctx = canvas.getContext('2d');
														  const pixel = ctx.getImageData(x, y, 1, 1).data;
														  const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
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
												
												
												
												// Give the element some data attributes that will allow it to be found quickly later, to aid with websocket messages updating the UI
												
												if(typeof needs['update'][what_property_is_needed]['thing_id'] == 'string' && typeof needs['update'][what_property_is_needed]['property_id'] == 'string'){
													//console.log("nice, this part of the template it already connected to a thing-property combo");
													child_els[ix].setAttribute('data-extension-dashboard-update-thing', needs['update'][what_property_is_needed]['thing_id']);
													child_els[ix].setAttribute('data-extension-dashboard-update-property', needs['update'][what_property_is_needed]['property_id']);
													child_els[ix].setAttribute('data-extension-dashboard-update-thing-combo', needs['update'][what_property_is_needed]['thing_id'] + '--x--' + needs['update'][what_property_is_needed]['property_id'] );
											
											
													// Is a read-only thing-property connected?
													let read_only = false;
													if(typeof needs['update'][what_property_is_needed]['property_details'] != 'undefined' && typeof needs['update'][what_property_is_needed]['property_details']['readOnly'] == 'boolean' && needs['update'][what_property_is_needed]['property_details']['readOnly'] == true){
														read_only = true;
													}
													//console.log("read_only property? ", read_only);
											
													
													if(read_only){
														if(child_els[ix].tagName == 'INPUT'){
															child_els[ix].setAttribute('disabled', true);
															//console.log("set the input element of the widget to disabled because a read-only property is connected");
														}
													}
													else{
														
														//console.log("ENUM getting closer");
														
														// If it's not a read-only property, and the element in an input element, 
														// then allow any changes to input elements to update the backend via websockets
														
														if(child_els[ix].tagName == 'INPUT' || child_els[ix].tagName == 'TEXTAREA'){
															//console.log("adding input event_listener to input child_el: ", child_els[ix])
															child_els[ix].addEventListener('change', (event) => {
																//console.log("dashboard input element changed.  event: ", event.type, event);
																event.preventDefault();
														
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
																
																		
																		
																				if(typeof this.recent_events[thing_id] == 'undefined'){
																					this.recent_events[thing_id] = {};
																				}
																		
																				if(typeof this.recent_events[thing_id][property_id] != 'undefined'){
																					if(this.recent_events[thing_id][property_id]['timestamp'] > Date.now() - 1000){
																						if(this.debug){
																							console.warn("dashboard: ABORT SENDING, as something was already sent/received for this property in the last 1 seconds: \nproperty_id: " + property_id + "\n" + JSON.stringify(this.recent_events[thing_id][property_id],null,4));
																						}
																						if(this.recent_events[thing_id][property_id]['value'] == event.target.value){
																							if(this.debug){
																								console.warn("... ABORT SENDING as it was the same value too!: ", this.recent_events[thing_id][property_id]['value']);
																							}
																							return
																						}
																				
																					}
																					else{
																						//delete this.recent_events[thing_id][property_id]; // will be filled again now anyway..
																					}
																				}
																		
																				// SENDING VALUE CHANGE VIA WEBSOCKET
																		
																				this.recent_events[thing_id][property_id] = {"timestamp":Date.now(), "value":event.target.value, "type":"sent"}; // remember what and when was sent
																				//console.error("dashboard: input changed, sending message over websocket.  thing_id, message: ", thing_id, "\n", JSON.stringify(outgoing_message,null,4));
																				//console.log("websocket client to send with? ", this.websockets[thing_id]);
																				if(this.websockets[thing_id].isConnected == false && this.websockets[thing_id].connecting == false){
																					if(this.debug){
																						console.warn("dashboard debug: unexpectedly had to re-connect the websocket client on input element change for thing_id: ", thing_id);
																					}
																					this.websockets[thing_id].connect();
																				}
																				this.websockets[thing_id].send(outgoing_message);
																		
																		
																				//this.recent_events.push({"thing_id":thing_id,"property_id":property_id,"timetamp":Date.now()});
																		
																				//console.log("dashboard: this.recent_events is now: ", this.recent_events);
																		
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
																				if(this.debug){
																					console.error("dashboard debug: caught error trying to send message via websocket: ", err);
																				}
																			}
																		}
																		else{
																			if(this.debug){
																				console.error("dashboard debug: no websocket for thing_id (yet)");
																			}
																		}
																	}
																}
																//this.handle_user_input(event,grid_id,what_property_is_needed);
															});
														}
														
														else if(child_els[ix].tagName == 'UL'){ // widget_type == 'list-selector' && 
															
															if(typeof needs['update'][what_property_is_needed]['thing_id'] == 'string' && typeof needs['update'][what_property_is_needed]['property_id'] == 'string'){ // widget_type == 'list-selector' && 
																const thing_id = needs['update'][what_property_is_needed]['thing_id'];
																const property_id = needs['update'][what_property_is_needed]['property_id'];
																const prop = this.get_property_by_ids(thing_id,property_id);
																if(prop){
																	//console.log("list-selector ENUM!: ", prop);
																	if(typeof prop['enum'] != 'undefined' && Array.isArray(prop['enum'])){
																		
																		let list_buttons_container_el = child_els[ix];
																		//list_buttons_container_el.innerHTML = '';
																		
																		for(let e = 0; e < prop['enum'].length; e++ ){
																			
																			const list_item_name = prop['enum'][e];
																			
																			//console.error("list_item_name: ", list_item_name);
																			
																			let enum_option_el = document.createElement('li');
																			enum_option_el.classList.add('extension-dashboard-list-selector-item');
																			enum_option_el.textContent = list_item_name;
																			
																			//console.log("appending: ", enum_option_el, " to: ", list_buttons_container_el);
																			//setTimeout(() => {
																				list_buttons_container_el.appendChild(enum_option_el);
																				//console.log("child_els[ix].children.length: ", list_buttons_container_el.children.length);
																				
																				enum_option_el.addEventListener('click', (event) => {
																					//console.log("Clicked on list selector item: ", list_item_name);
																				
																					if(typeof this.websockets[thing_id] != 'undefined'){
																						try{
																						
																							let outgoing_message = {
																								"messageType": "setProperty",
																								//"id":thing_id,
																								"data":{}
																							};
																						
																							outgoing_message['data'][property_id] = list_item_name;
																						
																							if(typeof this.recent_events[thing_id] == 'undefined'){
																								this.recent_events[thing_id] = {};
																							}
																						
																							if(typeof this.recent_events[thing_id][property_id] != 'undefined'){
																								if(this.recent_events[thing_id][property_id]['timestamp'] > Date.now() - 1000){
																									if(this.debug){
																										console.warn("dashboard debug: ABORT SENDING, as something was already sent/received for this property in the last 1 seconds: \nproperty_id: " + property_id + "\n" + JSON.stringify(this.recent_events[thing_id][property_id],null,4));
																									}
																									if(this.recent_events[thing_id][property_id]['value'] == event.target.value){
																										if(this.debug){
																											console.warn("dashboard debug: ... ABORT SENDING as it was the same value too!: ", this.recent_events[thing_id][property_id]['value']);
																										}
																										return
																									}
																								}
																							}
																						
																							// SENDING VALUE CHANGE VIA WEBSOCKET
																						
																							//console.log("sending update to backend via websockets.  outgoing_message: ", outgoing_message);
																							this.recent_events[thing_id][property_id] = {"timestamp":Date.now(), "value":event.target.value, "type":"sent"}; // remember what and when was sent
																							this.websockets[thing_id].send(outgoing_message);
																						
																						}
																						catch(err){
																							console.error("dashboard: caught error trying to send message via websocket: ", err);
																						}
																					}
																					else{
																						if(this.debug){
																							console.error("dashboard debug: no websocket for thing_id (yet)");
																						}
																					}
																				});
																				
																				
																			//},1);
																			
																			
																		}
																		
																	}
																}
																else{
																	//console.log("ENUM?? ", prop);
																}
															}
														}
														/*
														else if(child_els[ix].tagName == 'SELECT'){
															console.log("unexpectedly spotted a select dropdown in a template");
															
															console.log("SPOTTED A SELECT .. almost enum");
															console.log("widget_type: ", widget_type);
															console.log("what_property_is_needed: ", what_property_is_needed);
															
															if(typeof needs['update'][what_property_is_needed]['thing_id'] == 'string' && typeof needs['update'][what_property_is_needed]['property_id'] == 'string'){
																const prop = this.get_property_by_ids(needs['update'][what_property_is_needed]['thing_id'],needs['update'][what_property_is_needed]['property_id']);
																if(prop){
																	console.log("ENUM!: ", prop);
																	if(typeof prop['enum'] != 'undefined' && Array.isArray(prop['enum'])){
																		
																		let select_el = child_els[ix];
																		for(let e = 0; e < prop['enum'].length; e++ ){
																			
																			let enum_option_el = document.createElement('option');
																			enum_option_el.setAttibute('value',prop['enum'][e]);
																			enum_option_el.textContent = prop['enum'][e];
																			child_els[ix].appendChild(enum_option_el);
																		}
																		select_el.addEventListener('change', () => {
																			console.log("the select dropdown was changed to: ", select_el.value);
																			//TODO No template with a dropdown exists. This is a partial implementation.
																		})
																	}
																}
																else{
																	console.log("ENUM?? ", prop);
																}
															}
															
														}
														*/
														
													}
													
											
											
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
														
														//console.warn("dashboard: sorry, cannot open external link on the kiosk: ", needs['rename'][what_string_is_needed]);
														
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
													
												}
												
												
												// IFRAME
												
												else if(what_string_is_needed == 'URL' && child_els[ix].tagName == 'IFRAME'){
													if(this.debug){
														console.log("setting iframe src to: ", needs['rename'][what_string_is_needed]);
													}
													child_els[ix].src = needs['rename'][what_string_is_needed];
												}
												
												
												else{
													if(child_els[ix].tagName == 'INPUT' || child_els[ix].tagName == 'RANGE'){
														child_els[ix].value = needs['rename'][what_string_is_needed];
													}
													else{
														child_els[ix].textContent = needs['rename'][what_string_is_needed];
													}
													
												}
												
											}
											else{
												if(child_els[ix].tagName == 'INPUT' || child_els[ix].tagName == 'RANGE'){
													child_els[ix].value = null;
												}
												else{
													child_els[ix].textContent = '';
												}
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
												if(child_els[ix].tagName == 'IMG'){
													child_els[ix].src = '/extensions/dashboard/icons' + needs['icon'][what_icon_is_needed];
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
												child_els[ix].setAttribute('data-extension-dashboard-log-what_log_is_needed', what_log_is_needed);
												child_els[ix].setAttribute('data-extension-dashboard-log-widget_id', widget_id);
												
												//child_els[ix].setAttribute('data-extension-dashboard-log-thing-combo', needs['update'][what_property_is_needed]['thing_id'] + '-' + needs['update'][what_property_is_needed]['property_id'] );
												if(this.current_logs.indexOf(needs['log'][what_log_is_needed]['log_id']) == -1){
													this.current_logs.push(needs['log'][what_log_is_needed]['log_id']);
													//console.log("this.current_logs is now: ", this.current_logs);
												}
												else{
													if(this.debug){
														console.log("The same log twice? That log ID was already in the list of current logs: ", needs['log'][what_log_is_needed]['log_id'], this.current_logs);
													}
												}
												
											}
											else{
												//console.log("No log data in this widget's needs yet");
												//child_els[ix].textContent = '';
												needs['log'][what_log_is_needed] = {};
											}
										}
										
										
										
										
										
										
										// INCREASE AND DECREASE BUTTONS (THERMOSTAT)
										
										if(class_name.indexOf('-last-number-input') != -1){
											//console.log("class has -last-number-input.  last_spotted_number_input_el: ", last_spotted_number_input_el);
											
											try{
												if(last_spotted_number_input_el){
													let input_step = last_spotted_number_input_el.getAttribute('step');
													let input_min = last_spotted_number_input_el.getAttribute('min');
													let input_max = last_spotted_number_input_el.getAttribute('max');
													if(input_step && !isNaN(parseFloat(input_step))){
														
														input_step = parseFloat(input_step);
														//console.log("input element seemed to have a valid step attribute: ", input_step);
													}
													else{
														input_step = 1;
														if(input_min && input_max && !isNaN(parseFloat(input_min)) && !isNaN(parseFloat(input_max))){
															
															input_min = parseFloat(input_max);
															input_max = parseFloat(input_max);
															let input_range = parseFloat(input_max) - parseFloat(input_min);
															input_step = (input_max - input_min) / 20;
															if(input_step > 1){
																input_step = Math.floor(input_step);
															}
														}
														
													}
													if(this.debug){
														console.log("dashboard debug: landed on this input_step: ", typeof input_step, input_step);
													}
													if(typeof input_step == 'number'){
														
														if(class_name.indexOf('-decrease-') != -1){
															child_els[ix].addEventListener('click', (event) => {
																event.stopPropagation();
																//console.log("decreasing: ", last_spotted_number_input_el.value, " by ", input_step);
																let new_value = parseFloat(last_spotted_number_input_el.value);
																//console.log("new_value before step complicance: ", new_value);
																new_value = (new_value - (new_value % input_step));
																//console.log("new_value after step complicance: ", new_value);
																
																last_spotted_number_input_el.value = new_value - input_step;
																last_spotted_number_input_el.dispatchEvent(new Event('change')); // , { bubbles: true }
															});
														}
														
														else if(class_name.indexOf('-increase-') != -1){
															child_els[ix].addEventListener('click', (event) => {
																event.stopPropagation();
																//console.log("increasing: ", last_spotted_number_input_el.value, " by ", input_step);
																let new_value = parseFloat(last_spotted_number_input_el.value);
																//console.log("new_value before step complicance: ", new_value);
																new_value = (new_value - (new_value % input_step));
																//console.log("new_value after step complicance: ", new_value);
																
																last_spotted_number_input_el.value = new_value + input_step;
																last_spotted_number_input_el.dispatchEvent(new Event('change')); // , { bubbles: true }
																//last_spotted_number_input_el.dispatchEvent(new Event('input', { bubbles: true }));
															});
														}
														
													}
													
												}
											}
											catch(err){
												if(this.debug){
													console.error("caught error in dealing with -last-number-input element: ", err);
												}
											}
										}
										
										
										if(class_name == "extension-dashboard-click-to-copy-to-clipboard"){
											child_els[ix].addEventListener('click', () => {
												
												let text_to_copy = '';
												if(child_els[ix].tagName == 'INPUT' || child_els[ix].tagName == 'TEXTAREA' || child_els[ix].tagName == 'SELECT'){
													child_els[ix].select();
													child_els[ix].setSelectionRange(0, 99999);
													text_to_copy = child_els[ix].value;
													
												}
												else{
													text_to_copy = child_els[ix].textContent;
												}
												
												if(typeof text_to_copy == 'string'){
													
													text_to_copy = text_to_copy.trim();
													text_to_copy = text_to_copy.replace(/\s+/g, ' ');
													
													//console.log("text_to_copy: ", text_to_copy)
													
													if(text_to_copy){
														navigator.clipboard.writeText(text_to_copy);
														child_els[ix].classList.add('extension-dashboard-click-to-copy-to-clipboard-done');
														setTimeout(() => {
															child_els[ix].classList.remove('extension-dashboard-click-to-copy-to-clipboard-done');
														},1000);
														
														return
													}
													
												}
												
												child_els[ix].classList.add('extension-dashboard-click-to-copy-to-clipboard-failed');
												setTimeout(() => {
													child_els[ix].classList.remove('extension-dashboard-click-to-copy-to-clipboard-failed');
												},1000);
												
												
											});
											
										}
										
										if(class_name == "extension-dashboard-widget-save-value-locally"){
											if(typeof this.locally_saved_values[grid_id] == 'undefined'){
												this.locally_saved_values[grid_id] = {};
											}
											if(typeof this.locally_saved_values[grid_id][widget_id] == 'undefined'){
												this.locally_saved_values[grid_id][widget_id] = {};
											}
											
											
											const hopefully_unique_id = child_els[ix].className.replaceAll(' ','_').replace(/[^a-z0-9]/gi, '').replaceAll('extensiondashboard','');
											//console.log("dashboard: save value locally: hopefully_unique_id: ", hopefully_unique_id);
											
											if(hopefully_unique_id){
												if(typeof this.locally_saved_values[grid_id][widget_id][hopefully_unique_id] != 'undefined' && this.locally_saved_values[grid_id][widget_id][hopefully_unique_id] != null){
													//console.log("dashboard: save value locally: restoring input element's value: ", typeof this.locally_saved_values[grid_id][widget_id][hopefully_unique_id], this.locally_saved_values[grid_id][widget_id][hopefully_unique_id]);
													if(child_els[ix].tagName == 'INPUT' && child_els[ix].getAttribute('type') == 'checkbox'){
														child_els[ix].checked = this.locally_saved_values[grid_id][widget_id][hopefully_unique_id];
													}
													else{
														child_els[ix].value = this.locally_saved_values[grid_id][widget_id][hopefully_unique_id];
													}
													
												}
											
												child_els[ix].addEventListener('change', () => {
													try{
														if(child_els[ix].tagName == 'INPUT' && child_els[ix].getAttribute('type') == 'checkbox'){
															this.locally_saved_values[grid_id][widget_id][hopefully_unique_id] = child_els[ix].checked;
														}
														else if(typeof child_els[ix].value != 'undefined' && child_els[ix].value != null){
															this.locally_saved_values[grid_id][widget_id][hopefully_unique_id] = child_els[ix].value;
															
														}
														localStorage.setItem('extension_dashboard_locally_saved_values', JSON.stringify(this.locally_saved_values));
														//console.log("dashboard: this.locally_saved_values is now: ", this.locally_saved_values);
													}
													catch(err){
														console.error("dashboard: caught error in saving value locally: ", err);
														localStorage.removeItem('extension_dashboard_locally_saved_values');
													}
												});
											}
											
										}
										
										
										if(class_name == 'extension-dashboard-widget-adjust-width-to-input-length'){
											child_els[ix].addEventListener('change', () => {
												console.log("setpoint input changed")
												child_els[ix].style.width = (child_els[ix].value.length) + "ch";
											});
											child_els[ix].addEventListener('input', () => {
												console.log("setpoint input changed")
												child_els[ix].style.width = (child_els[ix].value.length) + "ch";
											});
											
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
						
						this.current_widget_id = widget_id;
						if(this.debug){
							console.log("dashboard debug: clicked on configure widget button.  this.current_widget_id is now: ", this.current_widget_id);
						}
						this.show_modal(grid_id,widget_id);
					})
					widget_content_el.appendChild(configure_widget_button_el);
					
				}
				else{
					if(this.debug){
						console.error("dashboard: found widget element, but could not find widget content element: " + grid_id + '-' + widget_id);
					}
				}
			}
			else{
				if(this.debug){
					console.error("dashboard: could not find widget element: " + grid_id + '-' + widget_id);
				}
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
			
			if(grid_id == null){
				grid_id = this.current_grid_id;
			}
			if(this.debug){
				console.log("dashboard debug: in show_modal:  grid_id,widget_id: ", grid_id,widget_id);
			}
			
			if(typeof grid_id != 'string' || typeof widget_id != 'string'){
				if(this.debug){
					console.error("dashboard: show_modal: no valid grid_id or widget_id provided: ", grid_id, widget_id);
				}
				return
			}
			
			
			
			const modal_el = document.getElementById('extension-dashboard-widget-modal');
			if(modal_el){
				
				if(typeof this.dashboards[grid_id] == 'undefined'){
					this.dashboards[grid_id] = {};
				}
				if(typeof this.dashboards[grid_id] != 'undefined'){
					if(typeof this.dashboards[grid_id]['widgets'] == 'undefined'){
						this.dashboards[grid_id]['widgets'] = {};
					}
					
					
					let modal_title = '';
					
					let thing_id = null;
					let property_id = null;
					
					if(typeof this.dashboards[grid_id]['widgets'][widget_id] == 'undefined'){
						this.dashboards[grid_id]['widgets'][widget_id] = {};
						modal_title = 'Select widget';
					}
					
					if(modal_title == ''){
						modal_title = 'Edit Widget';
					}
					this.modal_el.querySelector('#extension-dashboard-widget-modal-title').textContent = modal_title;
					
					
					const widget_type = this.set_highlighted_modal_template(grid_id,widget_id);
					if(this.debug){
						console.log("dashboard_debug: show_modal: widget_type: ", widget_type);
					}
					
					// GENERATE SETTINGS UI FOR THE WIDGET
					
					const modal_ui_container_el = this.modal_el.querySelector('#extension-dashboard-widget-modal-ui-container');
					if(modal_ui_container_el){
						
						modal_ui_container_el.innerHTML = '';
						
						let needs = {};
						if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'] != 'undefined'){
							needs = this.dashboards[grid_id]['widgets'][widget_id]['needs'];
							if(this.debug){
								console.log("dashboard_debug: copied intial needs from this.dashboards: ", needs);
							}
						}
						
						let widget_ui_el = document.createElement('div');
						widget_ui_el.classList.add('extension-dashboard-widget-ui');
				
						if(typeof needs['rename'] != 'undefined' || typeof needs['update'] != 'undefined' || typeof needs['icon'] != 'undefined' || typeof needs['log'] != 'undefined'){
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
							
							
							
							for (const [what_string_is_needed, value] of Object.entries(needs['rename'])) {
								//console.log(`rename: what_string_is_needed: ${what_string_is_needed}: ${value}`);
								
								let rename_title_el = document.createElement('h4');
								rename_title_el.textContent = what_string_is_needed.replaceAll('_',' ');
								rename_container_el.appendChild(rename_title_el);
								
								let rename_input_el = document.createElement('input');
								rename_input_el.setAttribute('type','text');
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
							
							let icons_per_page = 100;
							
							if(window.innerWidth > 1000 && window.innerHeight > 600){
								icons_per_page = 200;
							}
							
							
							widget_ui_el.appendChild(icon_container_el);
					
							for (const [what_icon_is_needed, value] of Object.entries(needs['icon'])) {
								console.log(`what_icon_is_needed: ${what_icon_is_needed}: ${value}`);
						
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
								
								let remove_icon_el = document.createElement('button');
								remove_icon_el.classList.add('text-button');
								remove_icon_el.textContent = 'Remove icon';
								remove_icon_el.addEventListener('click',() => {
									selected_icon_image_el.removeAttribute('src');
									icon_wrapper_el.classList.remove('extension-dashboard-widget-ui-icon-has-been-selected');
									this.dashboards[grid_id]['widgets'][widget_id]['needs']['icon'][what_icon_is_needed] = null;
									setTimeout(() => {
										icon_picker_container_el.scrollIntoView({ behavior: "smooth", block: "center" });
									},300);
								})
								
								
								icon_output_el.appendChild(selected_icon_image_el);
								icon_output_el.appendChild(remove_icon_el);
								
								//icon_output_el.textContent = what_icon_is_needed;
								icon_wrapper_el.appendChild(icon_output_el);
								
								
								// ICON PICKER
								
								let icon_picker_info_el = document.createElement('span');
								icon_picker_info_el.classList.add('extension-dashboard-widget-ui-icon-picker-info');
								
								let icon_picker_container_el = document.createElement('div');
								icon_picker_container_el.classList.add('extension-dashboard-widget-ui-icon-picker-container');
								
								
								selected_icon_image_el.addEventListener('click', () => {
									icon_wrapper_el.classList.remove('extension-dashboard-widget-ui-icon-has-been-selected');
									setTimeout(() => {
										icon_picker_container_el.scrollIntoView({ behavior: "smooth", block: "center" });
									},300);
								})
								
								
								
								// Icon picker tabs header
								
								let icon_picker_header_el = document.createElement('div');
								icon_picker_header_el.classList.add('extension-dashboard-widget-ui-icon-picker-header');
								icon_picker_header_el.classList.add('extension-dashboard-flex-between');
								
								/*
								let icon_picker_search_tab_button_el = document.createElement('div');
								icon_picker_search_tab_button_el.classList.add('extension-dashboard-widget-ui-icon-picker-search-button');
								icon_picker_search_tab_button_el.classList.add('text-button');
								icon_picker_search_tab_button_el.textContent = 'Search';

								icon_picker_header_el.appendChild(icon_picker_search_tab_button_el);
								*/
								
								
								let icon_search_input_el = document.createElement('input');
								icon_search_input_el.setAttribute('type','search');
								icon_search_input_el.setAttribute('placeholder','Search for an icon');
								icon_search_input_el.classList.add('extension-dashboard-widget-ui-icon-picker-search');
								
								icon_picker_header_el.appendChild(icon_search_input_el);
								
								let icon_picker_tags_tab_button_el = document.createElement('div');
								icon_picker_tags_tab_button_el.classList.add('extension-dashboard-widget-ui-icon-picker-tags-button');
								icon_picker_tags_tab_button_el.classList.add('text-button');
								icon_picker_tags_tab_button_el.textContent = 'Tags';
								
								icon_picker_header_el.appendChild(icon_picker_tags_tab_button_el);
								
								
								if(typeof value == 'string' && value.endsWith('.svg')){
									icon_picker_header_el.classList.add('extension-dashboard-widget-ui-icon-picker-show-close-button');
								}
								
								let icon_picker_close_button_el = document.createElement('div');
								icon_picker_close_button_el.classList.add('extension-dashboard-widget-ui-icon-picker-close-button');
								icon_picker_close_button_el.classList.add('text-button');
								icon_picker_close_button_el.textContent = '✕';
								icon_picker_close_button_el.addEventListener('click', () => {
									icon_wrapper_el.classList.add('extension-dashboard-widget-ui-icon-has-been-selected');
								});
								icon_picker_header_el.appendChild(icon_picker_close_button_el);
								
								icon_picker_container_el.appendChild(icon_picker_header_el);
								
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
								icon_picker_folders_container_el.style.display = 'none';
								icon_picker_container_el.appendChild(icon_picker_folders_container_el);

								
								//icon_picker_container_el.appendChild(icon_search_input_el);
								
								
								// add icon picker header buttons event listeners
								/*
								icon_picker_search_tab_button_el.addEventListener('click', () => {
									icon_search_input_el.style.display = 'inline-block';
									icon_picker_folders_container_el.style.display = 'none';
								});
								*/
								
								icon_picker_tags_tab_button_el.addEventListener('click', () => {
									//icon_search_input_el.style.display = 'none';
									icon_picker_folders_container_el.style.display = 'inline-block';
								});
								
								
								
								
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
								
								icon_output_el.appendChild(icon_picker_container_el);
						
								icon_container_el.appendChild(icon_wrapper_el);
							}
							
						}
						
						
						
						
						
						
				
						if(typeof needs['update'] != 'undefined'){
					
							let update_container_el = document.createElement('div');
							update_container_el.classList.add('extension-dashboard-widget-ui-update-container');
					
							widget_ui_el.appendChild(update_container_el);
					
					
							// DOING SOME BRUTE FORCE AUTOMATION
							// by checking if certain things are installed, and pre-linking them if no link has been made yet
				
							let no_thing_has_been_linked_yet = true;
							for (const [what_property_is_needed, value] of Object.entries(needs['update'])) {
								if(typeof needs['update'][what_property_is_needed]['thing_id'] == 'string'){
									no_thing_has_been_linked_yet = false;
									break
								}
							}
							
							if(widget_type && no_thing_has_been_linked_yet && this.all_things){
								if(this.debug){
									console.log("dashboard debug: show_modal: could try to pre-link.  widget_type,this.all_things: ", widget_type, this.all_things);
								}
								
								
								if(widget_type == 'media_player'){
									const pre_thing = this.get_thing_by_thing_id('internet-radio');
									if(this.debug){
										
									}
									console.log("dashboard debug: media_player pre_thing: ", pre_thing);
									if(pre_thing){
										
										const pre_made = {
										    "play_pause_button": {
										        "thing_id": "internet-radio",
										        "thing_title": "Radio",
										        "property_id": "power",
										        "property_title": "Playing"
										    },
										    "volume": {
										        "thing_id": "internet-radio",
										        "thing_title": "Radio",
										        "property_id": "volume",
										        "property_title": "Volume"
										    },
										    "source": {
										        "thing_id": "internet-radio",
										        "thing_title": "Radio",
										        "property_id": "station",
										        "property_title": "Station"
										    },
										    "song_title": {
										        "thing_id": "internet-radio",
										        "thing_title": "Radio",
										        "property_id": "song",
										        "property_title": "Song"
										    },
										    "artist": {
										        "thing_id": "internet-radio",
										        "thing_title": "Radio",
										        "property_id": "artist",
										        "property_title": "Artist"
										    }
										}
											
										if(typeof needs['update'] == 'object' && needs['update'] != null){
											needs['update'] = Object.assign({}, needs['update'], pre_made);
										}
										else{
											needs['update'] = pre_made;
										}
										
										if(this.debug){
											console.log("dashboard debug: pre-linked a media control widget to the internet-radio thing that was spotted");
										}
									}
								}
								
								else if(widget_type == 'weather'){
									const pre_thing = this.get_thing_by_thing_id('candle-weather-today');
									//console.log("weather pre_thing: ", pre_thing);
									if(pre_thing){
										
										const pre_made = {
										    "weather_description": {
										        "thing_id": "candle-weather-today",
										        "thing_title": "Weather today",
										        "property_id": "current_description",
										        "property_title": "Description"
										    },
										    "temperature": {
										        "thing_id": "candle-weather-today",
										        "thing_title": "Weather today",
										        "property_id": "temperature",
										        "property_title": "Temperature"
										    },
										    "humidity": {
										        "thing_id": "candle-weather-today",
										        "thing_title": "Weather today",
										        "property_id": "current_humidity",
										        "property_title": "Humidity"
											}
										}
										
										//needs['update'] = {...needs['update'], ...pre_made};
										if(typeof needs['update'] == 'object' && needs['update'] != null){
											needs['update'] = Object.assign({}, needs['update'], pre_made);
										}else{
											needs['update'] = pre_made;
										}
										
										if(this.debug){
											console.log("dashboard debug: pre-linked a weather widget to the Candle weather thing that was spotted");
										}
									}
								}
								
							}
							
					
							for (const [what_property_is_needed, value] of Object.entries(needs['update'])) {
								//console.log(`${what_property_is_needed}: ${value}`);
						
								let thing_id = null;
								if(typeof needs['update'][what_property_is_needed]['thing_id'] == 'string'){
									thing_id = needs['update'][what_property_is_needed]['thing_id'];
									//console.log("show_modal: a thing is already linked: ", thing_id);
								}
								else{
									//console.log("show_modal: no pre-linked thing spotted");
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
						
						
						//
						//  ACTION
						//
						
						if(typeof needs['action'] != 'undefined'){
							
							let action_container_el = document.createElement('div');
							action_container_el.classList.add('extension-dashboard-widget-ui-action-container');
					
							widget_ui_el.appendChild(action_container_el);
							
							
							for (const [what_action_is_needed, value] of Object.entries(needs['action'])) {
								//console.log(`${what_action_is_needed}: ${value}`);
						
								let thing_id = null;
								if(typeof needs['action'][what_action_is_needed]['thing_id'] == 'string'){
									thing_id = needs['action'][what_action_is_needed]['thing_id'];
									if(this.debug){
										console.log("dashboard debug: show_modal: an action thing is already linked: ", thing_id);
									}
								}
								else{
									//console.log("show_modal: no pre-linked thing spotted");
								}
								let action_id = null;
								if(typeof needs['action'][what_action_is_needed]['action_id'] == 'string'){
									action_id = needs['action'][what_action_is_needed]['action_id'];
									if(this.debug){
										console.log("dashboard debug:show_modal: an action_id is already linked: ", action_id);
									}
								}
								// needs['action'][what_action_is_needed]['action_id']
						
								let new_thing_selector_el = await this.generate_thing_selector(grid_id,widget_id,thing_id,action_id, what_action_is_needed,'action');
								if(new_thing_selector_el){
									//console.log("OK, NICE. Seems to have gotten a customized thing-action selector for the template");
									
									let what_action_is_needed_title_el = document.createElement('h4');
									what_action_is_needed_title_el.textContent = what_action_is_needed.replaceAll('_',' ');
									action_container_el.appendChild(what_action_is_needed_title_el);
						
									action_container_el.appendChild(new_thing_selector_el);
								}
								else{
									if(this.debug){
										console.error("dashboard: show_modal: generate_thing_selector did not return a thing selector element");
									}
								}
							}
							
							
						}
						
						
						
						//
						//  LOG
						//
						
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
											
											
											// Let user select the type of visualisation too
											
											let selected_log_type = '';
											if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['viz'] != 'undefined' && typeof this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['viz']['type'] == 'string'){
												selected_log_type = this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['viz']['type'];
											}
											
											/*
											let log_type_selector_el = document.createElement('select');
											
											let line_log_el = document.createElement('option');
											line_log_el.textContent = '📈 Line chart';
											line_log_el.value = 'line';
											if(line_log_el.value == selected_log_type){
												line_log_el.setAttribute('selected','selected');
											}
											log_type_selector_el.appendChild(line_log_el);
											
											
											let hourly_averages_log_el = document.createElement('option');
											hourly_averages_log_el.textContent = '🕑 Hourly';
											hourly_averages_log_el.value = 'hourly_average';
											if(hourly_averages_log_el.value == selected_log_type){
												hourly_averages_log_el.setAttribute('selected','selected');
											}
											log_type_selector_el.appendChild(hourly_averages_log_el);
											
											log_type_selector_el.addEventListener('change', () => {
												console.log("log type switched to: ", log_type_selector_el.value);
												if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['viz'] == 'undefined'){
													this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['viz'] = {};
												}
												this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['viz']['type'] = log_type_selector_el.value;
											});
											
											log_container_el.appendChild(log_type_selector_el);
											*/
											
										}
										else{
											if(this.debug){
												console.error("dashboard: show_modal: generate_thing_selector did not return a thing selector element");
											}
										}
									}
								}
						
							}
					
						}
						
						//if(widget_ui_el.innerHTML == ''){
						//	widget_ui_el.innerHTML = 'This widget does not have any settings';
						//}
						
						if(widget_ui_el.innerHTML != ''){
							modal_ui_container_el.appendChild(widget_ui_el);
						}
						else{
							modal_ui_container_el.innerHTML = '';
						}
						
					}
				}
				
				modal_el.showModal();
			}
			
		}
		
		
		get_thing_by_thing_id(thing_id=null){
			try{
				if(this.all_things && typeof thing_id == 'string' && thing_id.length){
					for(let ti = 0; ti < this.all_things.length; ti++){
						if(typeof this.all_things[ti]['href'] == 'string' && this.all_things[ti]['href'] == '/things/' + thing_id){
							return this.all_things[ti];
						}
					}
				}
			}
			catch(err){
				if(this.debug){
					console.error("get_thing_by_thing_id: caught error trying to find thing_id: ", thing_id);
				}
			}
			
			return null
		}
		
		get_property_by_ids(thing_id=null,property_id=null){
			if(typeof thing_id == 'string' && typeof property_id == 'string'){
				let thing = this.get_thing_by_thing_id(thing_id);
				if(thing){
					if(typeof thing['properties'] != 'undefined' && typeof thing['properties'][property_id] != 'undefined'){
						return thing['properties'][property_id];
					}
				}
			}
			return null
			
		}
		
		
		
		generate_log_selector(grid_id=null,widget_id=null,provided_thing_id=null,provided_property_id=null,what_log_is_needed=null){
			//console.log("in generate_log_selector. this.logs: ", this.logs);
			//console.log("- provided_thing_id,provided_property_id: ", provided_thing_id,provided_property_id);
			
			return new Promise((resolve, reject) => {
				
				if(grid_id == null){
		        	grid_id = this.current_grid_id;
		        }
			
				if(widget_id == null){
					if(this.debug){
						console.error("dashboard: generate_log_selector: no widget_id provided! aborting");
					}
					reject(null);
				}
			
				//console.log("in generate_log_selector.  grid_id,widget_id,provided_thing_id,provided_property_id,what_property_is_needed: ", grid_id,widget_id,provided_thing_id,provided_property_id,what_property_is_needed);
			
	    		// Pre populating the original item that will be clones to create new ones
	    	    this.update_logs_data()
				.then((logs) => {
					//console.log("generate_log_selector: got logs data: ", logs);
					
					let logs_select_el = document.createElement('select');
					logs_select_el.classList.add('extension-dashboard-modal-log-selector');
					
					let empty_log_option_el = document.createElement('option');
					empty_log_option_el.setAttribute('value','');
					empty_log_option_el.textContent = '-';
					logs_select_el.appendChild(empty_log_option_el);
					
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
							
							// Generate human-readable title for the log selector
							let log_option_title = log_thing_id.replaceAll('_',' ') + ' ' + log_property_id.replaceAll('_',' ');
							const target_thing = this.get_thing_by_thing_id(log_thing_id);
							if(target_thing && typeof target_thing['title'] == 'string' && typeof target_thing['properties'] != 'undefined' && target_thing['properties'][log_property_id] != 'undefined' && typeof target_thing['properties'][log_property_id]['title'] == 'string'){
								log_option_title = target_thing['title'] + " - " + target_thing['properties'][log_property_id]['title'];
							}
							log_option_el.textContent = log_option_title;
							
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
									
									if(selected_option_el.value == ''){
										console.log("user selected to unlink a log");
										this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed] = {};
									}
									else{
										//console.log("setting this.dashboards data for log.  grid_id, widget_id, what_log_is_needed, selected_thing_id,selected_log_id:  ", grid_id, widget_id, what_log_is_needed, selected_thing_id, selected_log_id );
										this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['thing_id'] = selected_thing_id;
										this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['property_id'] = selected_property_id;
										this.dashboards[grid_id]['widgets'][widget_id]['needs']['log'][what_log_is_needed]['log_id'] = selected_log_id;
										//this.dashboards[grid_id]['widgets'][widget_id]['type'] = 'log';
									}
									
									
								}
								else{
									if(this.debug){
										console.error("dashboard: selected_thing_id or selected_property_id was not a string: ", selected_thing_id, selected_property_id);
									}
								}
							
							}
							else{
								if(this.debug){
									console.error("dashboard: what_log_is_needed is not a string: ", what_log_is_needed);
								}
							}
							
							//console.log("this.dashboards is now: ", this.dashboards);
							//console.log("this.dashboards needs log is now: ", this.dashboards[grid_id]['widgets'][widget_id]['needs']['log']);
						}
						else{
							if(this.debug){
								console.error("dashboard: could not get selection option element from log select element?");
							}
						}
						
                	});
					
					resolve(logs_select_el);
					
				})
				.catch((err) => {
					if(this.debug){
						console.error("dashboard: generate_log_selector: caught error calling update_logs_data: ", err);
					}
					reject(null);
				})
			})
		}
		
		
		
		
		
		generate_thing_selector(grid_id=null,widget_id=null,provided_thing_id=null,provided_property_id=null,what_property_is_needed=null,need_type='update'){
	        if(this.debug){
	        	console.log("dashboard debug: generate_thing_selector: provided_thing_id, provided_property_id, what_property_is_needed, need_type: ", provided_thing_id, provided_property_id, what_property_is_needed, need_type);
	        }
			
			
			return new Promise((resolve, reject) => {
				
				if(grid_id == null){
		        	grid_id = this.current_grid_id;
		        }
			
				if(widget_id == null){
					if(this.debug){
						console.error("dashboard: generate_thing_selector: no widget_id provided! aborting");
					}
					reject(null);
				}
				
				//console.log("generate_thing_selector: available dashboard data: ", this.dashboards[grid_id]['widgets'][widget_id]);
			
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
		
		
					// Create empty option
					
					let empty_thing_option_el = document.createElement('option');
					empty_thing_option_el.value = "";
					empty_thing_option_el.textContent = '-';
					thing_select_el.appendChild(empty_thing_option_el);
					
					let found_already_selected_thing = false;
		
	    			// pre-populate the hidden 'new' item with all the thing names
	    			//var thing_ids = [];
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
    					if (thing_title.startsWith('highlights-') ){
    						// Skip highlight items
    						continue;
    					}
		
						if(typeof things[key]['href'] == 'string'){
		    				var thing_id = things[key]['href'].substr(things[key]['href'].lastIndexOf('/') + 1);
							if(typeof thing_id != 'string'){
								console.error("dashboard: thing_id was not a string!");
								continue;
							}
		    				try{
		    					if (thing_id.startsWith('highlights-') ){
		    						// Skip items that are already highlight clones themselves.
		    						//console.log(thing_id + " starts with highlight-, so skipping.");
		    						continue;
		    					}
				
		    				}
		    				catch(e){
		                        if(this.debug){
									console.log("dashboard: error in creating list of things for item: " + e);
								}
		                    }
					
				
							let thing_option_el = document.createElement('option');
							thing_option_el.value = thing_id;
							thing_option_el.textContent = thing_title;
				
							if(typeof provided_thing_id == 'string' && thing_id == provided_thing_id){
								found_already_selected_thing = true;
								//console.warn("thing selector creation FOUND already selected_thing. provided_thing_id: ", provided_thing_id);
								//console.log('setting thing to selected: ', thing_id, thing_title)
								thing_option_el.setAttribute('selected','selected');
						
								// if this is the selected thing, generate the initial properties select too
						
								const property_select_el = this.generate_property_select(grid_id, widget_id,provided_thing_id,provided_property_id,what_property_is_needed,need_type);
								if(property_select_el){
									thing_select_property_container_el.innerHTML = '';
									thing_select_property_container_el.appendChild(property_select_el);
								}
								else{
									if(this.debug){
										console.error("dashboard: thing_select_property_container_el did not return a select element");
									}
									thing_select_property_container_el.innerHTML = '?';
								}
						
							}
					
							thing_select_el.appendChild(thing_option_el);
						}
						else{
							if(this.debug){
								console.error("dashboard: thing data has no href attribute?");
							}
						}
	    				
	    			}
		
					if(found_already_selected_thing == false){
						//console.log("thing selector creation did not find already selected_thing");
						empty_thing_option_el.setAttribute('selected','selected');
					}
		
					
		
					//let action_select_el = null;
					let property_select_el = null;
					
                	thing_select_el.addEventListener("change", () => {
                		const change_to_thing_id = thing_select_el.value;
						if(this.debug){
							console.log("dashboard debug: change_to_thing_id: ", change_to_thing_id);
						}
						if(change_to_thing_id == ''){
							
							/*
							console.log("user deselected a thing.  But which property/action should be removed? property_select_el: ", property_select_el);
							console.log("- what_property_is_needed: ", what_property_is_needed);
							if(property_select_el && typeof property_select_el.value == 'string'){
								console.log("- dangling property: ", property_select_el.value);
							}
							*/
							if(typeof what_property_is_needed == 'string'){
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_id'] == 'string'){
									if(this.debug){
										console.log("removed connection to previously linked thing: " + this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_id']);
									}
									delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_id'];
								}
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_title'] == 'string'){
									delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_title'];
								}
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_id'] == 'string'){
									delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_id'];
								}
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_title'] == 'string'){
									delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_title'];
								}
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_details'] != 'undefined'){
									delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_details'];
								}
								if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['action_id'] == 'string'){
									delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['action_id'];
								}
							
								console.warn("dashboard data for need_type is now: ", need_type, this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed])
							}
							
						}
						else{
							
							property_select_el = this.generate_property_select(grid_id,widget_id,change_to_thing_id,null,what_property_is_needed,need_type);
							if(property_select_el){
								thing_select_property_container_el.innerHTML = '';
								thing_select_property_container_el.appendChild(property_select_el);
							}
							else{
								if(this.debug){
									console.error("dashboard: modal thing selector on change: generate_property_select did not return a select element");
								}
								thing_select_property_container_el.innerHTML = '?';
							}
							
							
							// Try to pre-select this thing for the other thing-property selectors if they don't have a selection yet
							const update_root_el = thing_select_el.closest('.extension-dashboard-widget-ui-update-container');
							if(update_root_el){
								let all_thing_selectors = update_root_el.querySelectorAll('.extension-dashboard-modal-thing-select');
								for(let ts = 0; ts < all_thing_selectors.length; ts++){
									if(all_thing_selectors[ts].value == ''){
										//console.log("spotted a thing selector with an empty value");
										const check_if_it_has_the_same_option_el = all_thing_selectors[ts].querySelector('option[value="' + thing_select_el.value + '"]');
										//console.log("check_if_it_has_the_same_option_el: ", check_if_it_has_the_same_option_el);
										if(check_if_it_has_the_same_option_el){
											//console.log("setting other thing select to same value: ", thing_select_el.value);
											all_thing_selectors[ts].value = thing_select_el.value;
											var event = new Event('change');
											all_thing_selectors[ts].dispatchEvent(event);
										}
									
									}
								}
							}
							
							
						}
						
						
                	});
					
					thing_select_thing_container_el.appendChild(thing_select_el);	
				
					thing_select_container_el.appendChild(thing_select_thing_container_el);
					thing_select_container_el.appendChild(thing_select_property_container_el);
			
					resolve(thing_select_container_el);
	    	    })
				.catch((err) => {
					if(this.debug){
						console.error("dashboard: generate_thing_selector: caught error calling update_things_data: ", err);
					}
					reject(null);
				})
				
			});
			
		}
		
		
		
		generate_property_select(grid_id=null, widget_id=null, provided_thing_id=null, provided_property_id=null, what_property_is_needed=null, need_type='update'){
			if(this.debug){
				if(typeof grid_id != 'string'){
					console.error("dashboard: generate_property_select: no grid_id provided");
				}
				if(typeof widget_id != 'string'){
					console.error("dashboard: generate_property_select: no widget_id provided");
				}
			}
			
			if(this.debug){
				console.log("in generate_property_select:  provided_thing_id, provided_property_id, what_property_is_needed, need_type: ", provided_thing_id, provided_property_id, what_property_is_needed, need_type);
			}
			
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
								
								let attribute = 'properties';
								if(need_type == 'action'){
									attribute = 'actions';
								}
								
								if(typeof things[key][attribute] != 'undefined' && Object.keys(things[key][attribute]).length){
									
									let property_select_el = document.createElement('select');
									let properties = things[key][attribute];
									
									let empty_property_option_el = document.createElement('option');
									empty_property_option_el.value = "";
									empty_property_option_el.textContent = "-";
									property_select_el.appendChild(empty_property_option_el);
									/*
									if(provided_property_id == null && Object.keys(properties).indexOf('brightness') != -1){
										provided_property_id = 'brightness';
									}
									else if(provided_property_id == null && Object.keys(properties).indexOf('state') != -1){
										provided_property_id = 'state';
									}
									*/
									
									let found_selected = false;
									for (let prop in properties){
										
										const property_id = prop;
										
										var property_title = null;
										if( properties[prop].hasOwnProperty('title') ){
											property_title = properties[prop]['title'];
										}
										else if( properties[prop].hasOwnProperty('label') ){
											property_title = properties[prop]['label'];
										}
										else{
											property_title = property_id;
										}
										
										if(typeof property_title == 'string'){
						
											let property_option_el = document.createElement('option');
											property_option_el.value = property_id;
											property_option_el.textContent = property_title;
						
											if(property_id == provided_property_id){
												//console.log('setting select property option to selected: ', property_id, property_title)
												property_option_el.setAttribute('selected','selected');
												found_selected = true;
											}
											property_select_el.appendChild(property_option_el);
											
										}
            
									}
									
									if(found_selected == false){
										empty_property_option_el.setAttribute('selected','selected');
									}
				
				
									property_select_el.addEventListener("change", () => {
					
										const property_id = property_select_el.value;
										if(this.debug){
											console.log("dashboard debug: switched to property/action with ID: ", property_id);
										}
										
										if(typeof property_id == 'string' && typeof properties[property_id] != 'undefined'){
											
											if(typeof this.dashboards[grid_id]['widgets'] == 'undefined'){
												this.dashboards[grid_id]['widgets'] = {};
											}
											if(typeof this.dashboards[grid_id]['widgets'][widget_id] == 'undefined'){
												this.dashboards[grid_id]['widgets'][widget_id] = {};
											}
											
											if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'] == 'undefined'){
												this.dashboards[grid_id]['widgets'][widget_id]['needs'] = {};
											}
											if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type] == 'undefined'){
												this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type] = {};
											}
											if(typeof what_property_is_needed == 'string'){
												if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed] == 'undefined'){
													this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed] = {};
												}
											}
											
											
											if(property_id == ''){
												
												if(this.debug){
													console.log("dashboard debug: de-selected the property");
												}
												
												// switched to unselected
												if(typeof what_property_is_needed == 'string'){
													if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_id'] == 'string'){
														if(this.debug){
															console.log("removed connection to previously linked thing: " + this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_id']);
														}
														delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_id'];
													}
													if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_title'] == 'string'){
														delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_title'];
													}
													if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_id'] == 'string'){
														delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_id'];
													}
													if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_title'] == 'string'){
														delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_title'];
													}
													if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_details'] != 'undefined'){
														delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_details'];
													}
													if(typeof this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['action_id'] != 'undefined'){
														delete this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['action_id'];
													}
												}
											}
											else{
												var property_title = "Unnamed";
												if( properties[property_id].hasOwnProperty('title') ){
													property_title = properties[property_id]['title'];
												}
												else if( properties[property_id].hasOwnProperty('label') ){
													property_title = properties[property_id]['label'];
												}
												else {
													property_title = property_id;
												}
												
												if(this.debug){
													console.log("dashboard debug: selected the property: ", property_title, ", for what_property_is_needed: ", what_property_is_needed);
												}
											
												if(typeof what_property_is_needed == 'string'){
													this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_id'] = thing_id;
													this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['thing_title'] = thing_title;
													this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_id'] = property_id;
													this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['action_id'] = property_id;
													this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_title'] = property_title;
													if(typeof properties[property_id] != 'undefined'){
														this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]['property_details'] = properties[property_id];
													}
													
												}
												else{
													if(this.debug){
														console.error("dashboard debug: property_select changed, but what_property_is_needed is not a string?");
													}
												}
												if(this.debug){
													console.log("dashboard debug: after select change, needs details is now: ", this.dashboards[grid_id]['widgets'][widget_id]['needs'][need_type][what_property_is_needed]);
												}
											}
											
											
											
										}
					
									});
							
									//var fake_change_event = new Event('candle');
									//property_select_el.dispatchEvent(fake_change_event);
							
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
		
		
		
		
		
		
		
		
		
		
		
		
		//
		//   LOGS
		//
		
		
		update_logs_data(){
			//console.log("in update_logs_data.  last_time_logs_updated: ", this.last_time_logs_updated);
			let promise = new Promise((resolve, reject) => {
				
				if(this.last_time_logs_updated < (Date.now() - 58000) || this.logs == null){
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
							if(this.debug){
								console.error("dashboard: generate_log_selector: no logs?");
							}
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
						if(this.debug){
							console.error("dashboard: caught error in update_logs_data: ", err);
						}
					})
				}
				else{
					resolve(this.logs);
				}
			});
			return promise;
		}
		
		
		
		load_logs_data(fresh_log_data_load=null){
			//console.log("dashboard: in load_logs_data.  fresh_log_data_load,last_time_logs_loaded: ", fresh_log_data_load, this.last_time_logs_loaded);
			let promise = new Promise((resolve, reject) => {
				
				if(fresh_log_data_load == false && this.logs_data != null){
					resolve();
				}
				else if(this.last_time_logs_loaded < (Date.now() - 27000) || this.logs_data == null || fresh_log_data_load === true){
					//console.log("dashboard: requesting latest raw logs data from backend");
					if(this.current_logs.length){
			            window.API.postJson(
			                `/extensions/${this.id}/api/ajax`, {
			                    'action': 'get_logs_data',
			                    'log_ids': this.current_logs
			                }
			            ).then((body) => {
			                if(this.debug){
								console.log('dashboard debug: load_logs_data: get_logs_data response: ', body);
							}
					
							if(body.state === true && (body['raw_numeric_log_data'].length || body['raw_boolean_log_data'].length)){
								if(this.debug){
									console.log("dashboard debug: OK, seem to have gotted valid raw log data");
								}
						
								this.last_time_logs_loaded = Date.now();
						
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
								
								// make sure the recorded data points are sorted in temporal order
								let logs_keys = Object.keys(this.logs_data);
								for(let lk = 0; lk < logs_keys.length; lk++){
									this.logs_data[ logs_keys[lk] ].sort(function(a,b) { return a['d'].getTime() - b['d'].getTime() });
								}
								resolve();
						
							}
							else{
								if(this.debug){
									console.warn("dashboard: was unable to retrieve logs data (make sure there is logs data)");
								}
								if(this.logs_data){
									resolve();
								}
								else{
									reject();
								}
							
							}
						
			            }).catch((err) => {
			                if(this.debug){
								console.error("dashboard: caught error doing get_logs_data request: ", err);
							}
							if(this.logs_data){
								resolve();
							}
							else{
								reject();
							}
			            });
					}
		            else if(this.logs_data){
						resolve();
					}
					else{
						reject();
					}
					
				}
				else{
					resolve();
				}
			});
			return promise;
		}
		
		
		// Log ID is the log ID used in the logs database, which is a number
		// setting fresh_log_data_load to true force a reload of data from the backend.
		// setting fresh_log_data_load to false forces NOT reloading data from the backend
		// if fresh_log_data_load is null, the load_log_data function makes to choice based on how long ago fresh log data was last loaded
			
		render_logs(fresh_log_data_load=null,log_id_to_render=null){
			
			
			if(this.current_logs.length == 0){
				if(this.debug){
					//console.log("dashboard debug: current dashboard does not have any logs, so no need to render logs.");
				}
				return
			}
			
			if(this.debug){
				console.log("dashboard debug: in render_logs.  fresh_log_data_load, log_id_to_render: ", fresh_log_data_load, log_id_to_render);
			}
			
			if(typeof log_id_to_render == 'string' && this.logs_data[log_id_to_render] == 'undefined'){
				fresh_log_data_load = true;
			}
			
			this.load_logs_data(fresh_log_data_load)
			.then(() => {
				
				if(this.logs_data){
					for (const [log_id, local_log_data] of Object.entries(this.logs_data)) {
	
						if(typeof log_id_to_render == 'string' && log_id != log_id_to_render){
							if(this.debug){
								console.log("dashboard debug: render_logs: skipping a render because specific log_id_to_render was set: ", log_id_to_render);
							}
							continue
						}
						
						//let log_data = structuredClone(original_log_data);
	
						for (let lo = 0; lo < this.logs.length; lo++){
							if(this.logs[lo]['id'] == log_id){
								//console.log("found the log data match");
								let log_thing_id = null;
								if(typeof this.logs[lo]['thing'] == 'string'){
									log_thing_id = this.logs[lo]['thing'];
								}
								let log_property_id = null;
								if(typeof this.logs[lo]['property'] == 'string'){
									log_property_id = this.logs[lo]['property'];
								}
								//console.log("log_thing_id: ", log_thing_id);
								//console.log("log_property_id: ", log_property_id);
								
								let log_viz_container_el = document.querySelector('#extension-dashboard-' + this.current_grid_id + ' div[data-extension-dashboard-log-id="' + log_id + '"]');
								if(log_viz_container_el){
									
									let log_viz_el = log_viz_container_el.querySelector('.extension-dashboard-widget-checkbox-toggle-unchecked-content');
									let log_viz_el2 = log_viz_container_el.querySelector('.extension-dashboard-widget-checkbox-toggle-checked-content');
									
									if(log_viz_el == null){
										log_viz_el = document.createElement('div');
										log_viz_container_el.appendChild(log_viz_el);
									}
									log_viz_el.classList.remove('extension-dashboard-widget-checkbox-toggle-unchecked-content');
									
									if(log_viz_el2){
										//console.log("log_viz_el2 already existed");
										log_viz_el2.classList.add('extension-dashboard-hidden');
										log_viz_el2.classList.remove('extension-dashboard-widget-checkbox-toggle-checked-content');
									}
									
									
									// Create a copy of the local data, so that the local data isn't modified
									
									//let log_data = Object.assign({}, local_log_data);
									let log_data = structuredClone(local_log_data);
									
									if(this.debug){
										console.log("dashboard debug: log_data clone: ", log_data);
									}
									
									
									
									// Did the user set a prefered visualization type?
									
									/*
									// Get Widget_id from DOM
									let widget_root_el = log_viz_el.closest('.grid-stack-item[gs-id]');
									
									if(widget_root_el == null){
										console.error("could not find widget root element?");
										continue
									}
									
									let widget_id = widget_root_el.getAttribute('gs-id');
									if(typeof widget_id != 'string'){
										console.error("widget root element had invalid widget id?");
										continue
									}
									*/
									
									
									
									// GET INFORMATION ABOUT THE WIDGET, INCLUDING IT'S PIXEL DIMENSIONS
									
									
									const widget_id = log_viz_el.getAttribute('data-extension-dashboard-log-widget_id');
									const what_log_id_needed = log_viz_el.getAttribute('data-extension-dashboard-log-what_log_id_needed');
									
									/*
									let log_viz_type = 'line';
									if(
										typeof this.dashboards[this.current_grid_id] != 'undefined' && 
										typeof this.dashboards[this.current_grid_id]['widgets'] != 'undefined' && 
										typeof this.dashboards[this.current_grid_id]['widgets'][widget_id] != 'undefined' && 
										typeof this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs'] != 'undefined' && 
										typeof this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['log'] != 'undefined' &&
										typeof this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['log'][what_log_id_needed] != 'undefined' && 
										typeof this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['log'][what_log_id_needed]['viz'] != 'undefined' && 
										typeof this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['log'][what_log_id_needed]['viz']['type'] == 'string'
									){
										if(this.debug){
											console.log("dashboard debug: render_logs: log needs: ", this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['log']);
										}
										log_viz_type = this.dashboards[this.current_grid_id]['widgets'][widget_id]['needs']['log']['viz']['type'];
									}
									
									if(this.debug){
										console.log("dashboard debug: render_logs: log_viz_type: ", log_viz_type);
									}
									*/
					
									// Should the dataviz be rendered in a compact manner for a 1x1 widget?
									let wideness_hint_el = log_viz_el.closest('[gs-w]');
									let tallness_hint_el = log_viz_el.closest('[gs-h]');
									
									
									let wideness_hint_number = 1;
									if(wideness_hint_el){
										let wideness_hint = wideness_hint_el.getAttribute("gs-w");
										//console.log("wideness_hint: ", wideness_hint);
										if(typeof wideness_hint == 'string'){
											wideness_hint = parseInt(wideness_hint);
											if(!isNaN(wideness_hint)){
												wideness_hint_number = wideness_hint;
												if(this.debug){
													console.log("dashboard debug: render_logs: widget's horizontal size: ", typeof wideness_hint_number, wideness_hint_number);
												}
											}
										}
									}
									
									let tallness_hint_number = 1;
									if(tallness_hint_el){
										let tallness_hint = tallness_hint_el.getAttribute("gs-h");
										if(typeof tallness_hint == 'string'){
											tallness_hint = parseInt(tallness_hint);
											if(!isNaN(tallness_hint)){
												tallness_hint_number = tallness_hint;
												if(this.debug){
													console.log("dashboard debug: render_logs: widget's vertical size: ", typeof tallness_hint_number, tallness_hint_number);
												}
											}
										}
									}
									
									let svg_width_padding = 0;
									let svg_height_padding = 0;
									if(wideness_hint_el){
										svg_width_padding = 20;
									}
									if(tallness_hint_el){
										svg_height_padding = 20;
									}
									//console.log("Found the element that the dataviz should be placed into: ", log_viz_el);
					
									//console.log("the relevant  log_data: ", log_data);
					
									const real_rect = log_viz_container_el.getBoundingClientRect(log_viz_el);
									if(this.debug){
										console.log("dashboard debug: render_logs: log_viz_el real_rect: ", real_rect);
									}
					
									if(real_rect.width < 20){
										if(this.debug){
											console.error("dashboard debug: render_logs: could not get pixel size of container:  width,height:", real_rect.width, real_rect.height);
										}
										//real_rect = {'width':300,'height':150} // just guessing a size
									}
					
									const rect = {
											"width":Math.floor(real_rect.width),
											"height":Math.floor(real_rect.height),
											}
											
									if(this.debug){
										console.log("dashboard debug: render_logs: new rect: ", rect);
									}
									
									// for very wide widgets, allow the svg to render a little wider
									if(tallness_hint_number == 2 && wideness_hint_number > 2){
										rect['width'] = Math.round(rect['width'] * 1.15);
									}
									
									if(this.debug){
										console.log("dashboard debug: render_logs: new rect after size adustment: ", rect);
									}
									
									// ANALYZE THE DATA
									
									
									// Find out some information about the length of time we have data for
									const real_oldest = d3.min(log_data, d => d.d);
									//console.log("real_oldest: ", real_oldest);
									
									// Check if the data is for a boolean
									let is_boolean_log = true;
									let spotted_a_one = false;
									for(let dp = 0; dp < log_data.length; dp++){
										if(typeof log_data[dp]['v'] != 'number' || typeof log_data[dp]['d'] == 'undefined'){
											if(this.debug){
												console.error("SKIPPING LOG! unexpected/missing value in log datapoint: ", log_data[dp]);
											}
											continue
										}
										if(log_data[dp]['v'] === 1){
											spotted_a_one = true;
										}
										
										if(log_data[dp]['v'] != 1 && log_data[dp]['v'] != 0){
											is_boolean_log = false;
											break
										}
									}
									if(spotted_a_one == false){ // empty logs only have the value zero, but that doesn't mean they are boolean
										is_boolean_log = false;
									}
									
									if(this.debug){
										console.log("dashboard debug: render_logs:  is_boolean_log: ", is_boolean_log);
									}
									
									
									
									/*
									// used to during development to make the graph less dense
									if(is_boolean_log == false && this.developer){
										// PRUNING
										
										
										let pruned_data = [];
										for(let g = 0; g < log_data.length; g++){
											if(g % 6 == 0){
												pruned_data.push(log_data[g]);
											}
										}
										console.error("\n\n\nWARNING: PRUNING DATA BEFOREHAND!\n\n\n--> length before and after: ", log_data.length, pruned_data.length);
										log_data = pruned_data;
									}
									*/
									
									
									
									
									
									
									
									
									const highest = d3.max(log_data, d => d.v);
									const lowest = d3.min(log_data, d => d.v);
									
									let hourly_data = [];
									
									let now_timestamp = Date.now();
									
									//console.log("now_timestamp: ", now_timestamp);
									
									// We work our way backwards in time as we loop over the data
									
									// above_zero: the amount of milliseconds that the device was switched on (boolean 1) during a particular hour
									
									let hours_into_the_past = 0;
									let start_of_this_hour = now_timestamp - (now_timestamp % (60000*60));
									let end_of_this_hour = start_of_this_hour + (60000*60);
									let above_zero_end_stamp = null;
									//let above_zero = 0; 
									let next_value = null;
									let next_date_stamp = null;
									let future_boolean_off_date_stamp = null;
									let last_boolean_off_hour = null;
									let future_boolean_off_hour_start = null;
									
									//let total_data = {'minimum':[],'maximum':[],'average':[],'above_zero':[]};
									//let hour_data = {'minimum':null,'maximum':null,'average':null,'above_zero':0};  
									
									
									let alt_log_data = [];
									
									// Create an array with empty slots
									let hours_data = [];
									//let decreaser = 25;
									for(let h = 0; h < 25; h++){
										
										hours_data.push({'hours_into_the_past': h,'minimum':null,'maximum':null,'average':null,'start':(start_of_this_hour - (h * (60000 * 60))),'end':(end_of_this_hour - (h * (60000 * 60))),'beyond_start_value':null,'beyond_end_value':null,'values_to_average':[],'above_zero':0});
										const millis_into_the_past = (60000 * 60 * (24 - h));
										//console.log("millis_into_the_past: ", millis_into_the_past);
										alt_log_data.unshift({"d":new Date(start_of_this_hour - (60000 * 60 * h)), "v":null, "h":h, "millis_into_the_past":(60000 * 60 * h)});
										
										
										//decreaser--;
									}
									
									/*
									for(let ah = 25; ah >= 0; ah--){
										alt_log_data[ah] = {"d":new Date(start_of_this_hour - (60000 * 60 * ah)),"v":null}
									}
									*/
									
									//hours_data[0]['start'] = start_of_this_hour;
									//hours_data[0]['end'] = end_of_this_hour;
									hours_data[0]['incomplete'] = true;
									
									//console.log("inital start_of_this_hour: ", start_of_this_hour);
									//console.log("inital end_of_this_hour: ", end_of_this_hour);
									
									
									
									
									
									
									let min_max_lines_would_be_nice = false; // would it even make sense to display the minimum and maximum values spotted during the hour?
									for(let dp = log_data.length - 1; dp >= 0; dp--){
										//console.log("dp: ", log_property_id, dp);
										const this_date_stamp = log_data[dp]['d'].getTime();
										const this_value = log_data[dp]['v'];
										
										/*
										if(typeof next_date_stamp == 'number'){
											console.log("this point is earlier: \n - sec: ", Math.round(next_date_stamp - this_date_stamp)/1000, "\n - min: ", Math.round(next_date_stamp - this_date_stamp)/60000);
										}
										*/
										
										// If could be that the first datapoint is in the previous hour, or even hours old
										if(this_date_stamp < start_of_this_hour){
											if(this.debug){
												console.warn("\ndashboard debug: log averages:\n\n\nDONGGGGG\n\nShifting to an earlier hour for: ", log_property_id, "\n\n - hours_into_the_past: ", hours_into_the_past);
											}
											
											
											
											//
											// CALCULATE HOUR AVERAGES
											//
											
											if(is_boolean_log == false){
												
												if(this.debug){
													console.warn("\n\n\ndashboard debug: CALCULATING NUMERIC AVERAGES FOR THE HOUR THAT IS NOW COMPLETE: " + start_of_this_hour + " of " + log_property_id + "\n\n\n");
													console.log("dashboard debug: values_to_average: ", hours_data[hours_into_the_past]['values_to_average'].length);
												}
												let nuanced_values = [];
												
												let total_score = 0; // millis * average of each two adjoining points, all added up
												
												// for completeness, remember what datapoint ended the hour loop. This will be useful to calculate averages later that take into account how the value was changing over time
												hours_data[hours_into_the_past]['beyond_start_value'] = {'t':this_date_stamp, 'v':this_value};
											
												if(hours_data[hours_into_the_past]['values_to_average'].length){
													
													let raw_nuance = [];
													let total_millis_accounted_for = 0;
													let hypothetical_value_at_end_of_hour = null;
													let hypothetical_value_at_start_of_hour = null;
													
													// calculate the slope between the most futuristic datapoint inside the hour, and a futuristic datapoint outside of the that hour;
													if(hours_data[hours_into_the_past]['beyond_end_value'] != null){
														
														let newest_point_inside_the_hour = hours_data[hours_into_the_past]['values_to_average'][0]; // hours_data[hours_into_the_past]['values_to_average'].length  - 1
														
														const millis_in_this_hour = hours_data[hours_into_the_past]['end'] - newest_point_inside_the_hour['t'];
														//console.log("beyond_end millis_in_this_hour, as sec: ", millis_in_this_hour / 1000);
														//console.log("millis outside of the hour, as sec: ", (hours_data[hours_into_the_past]['beyond_end_value']['t'] - hours_data[hours_into_the_past]['end'])/1000  );
														total_millis_accounted_for += millis_in_this_hour;
														let ratio_inside_this_hour = millis_in_this_hour / (hours_data[hours_into_the_past]['beyond_end_value']['t'] - newest_point_inside_the_hour['t']);
														//console.log("ratio_inside_this_hour: ", ratio_inside_this_hour);
														
														
														//console.log("value of point outside of the hour: ", hours_data[hours_into_the_past]['beyond_end_value']['v']);
														//console.log("value of newest_point_inside_the_hour['v']: ", newest_point_inside_the_hour['v']);
														let value_delta = Math.abs(newest_point_inside_the_hour['v'] - hours_data[hours_into_the_past]['beyond_end_value']['v']);
														//console.log("value_delta: ", value_delta);
														
														value_delta = value_delta * ratio_inside_this_hour;
														//console.log("value_delta after applying ratio: ", value_delta);
														
														if(hours_data[hours_into_the_past]['beyond_end_value']['v'] > newest_point_inside_the_hour['v']){
															hypothetical_value_at_end_of_hour = newest_point_inside_the_hour['v'] + value_delta;
														}
														else{
															hypothetical_value_at_end_of_hour = newest_point_inside_the_hour['v'] - value_delta;
														}
														
														//console.log("hypothetical_value_at_end_of_hour: ", hypothetical_value_at_end_of_hour);
														//raw_nuance.push({'m':millis_in_this_hour,'v':((hypothetical_value_at_end_of_hour + newest_point_inside_the_hour['v']) / 2 )});
														//nuanced_values.push( ((hypothetical_value_at_end_of_hour + newest_point_inside_the_hour['v']) / 2 ) * millis_in_this_hour);
														const beyond_end_score = ((hypothetical_value_at_end_of_hour + newest_point_inside_the_hour['v']) / 2 ) * (millis_in_this_hour / 1000);
														//console.log("adding beyond_end_score: ", beyond_end_score);
														total_score += beyond_end_score
														//console.log("total_score for this hour is now: ", total_score);
														
														delete hours_data[hours_into_the_past]['beyond_end_value'];
													}
													
													
													
													
													// Add the 'normal' consecutive points that were all within the hour
													
													let dumb_total = hours_data[hours_into_the_past]['values_to_average'][0]['v']; // as a test, also just take all the recorded values and average them. Shouldn't be too far off from the 'nuanced' calculation
													
													for(let vt = 1; vt < hours_data[hours_into_the_past]['values_to_average'].length; vt++){
														dumb_total += hours_data[hours_into_the_past]['values_to_average'][vt]['v'];
														
														// Calculate the average for two consecutive datapoints
														const average_value = (hours_data[hours_into_the_past]['values_to_average'][vt - 1]['v'] + hours_data[hours_into_the_past]['values_to_average'][vt]['v']) / 2;
														
														// Then multiply this average with the time delta between those two points
														//console.log("average_value: ", hours_data[hours_into_the_past]['values_to_average'][vt - 1]['v'], hours_data[hours_into_the_past]['values_to_average'][vt]['v'], " -> ", average_value);
														const duration = hours_data[hours_into_the_past]['values_to_average'][vt - 1]['t'] - hours_data[hours_into_the_past]['values_to_average'][vt]['t'];
														//console.log("normal duration, in seconds: ", duration/1000);
														//raw_nuance.push({'m':duration,'v':average_value});
														total_millis_accounted_for += duration;
														
														const normal_point_score = (duration/1000) * average_value;
														//console.log("+ average_value, duration (in seconds), and normal_point_score: ", average_value, (duration/1000) + "s", " -> ", normal_point_score);
														total_score += normal_point_score;
														//nuanced_values.push( average_value * duration );
													}
													
													
													
													
													
													
													// calculate the slope between the most futuristic datapoint inside the hour, and a futuristic datapoint outside of the that hour;
													if(hours_data[hours_into_the_past]['beyond_start_value'] != null){
														
														let oldest_point_inside_the_hour = hours_data[hours_into_the_past]['values_to_average'][ hours_data[hours_into_the_past]['values_to_average'].length  - 1 ];
														const start_millis_in_this_hour = (oldest_point_inside_the_hour['t'] - hours_data[hours_into_the_past]['start']);
														//console.log("beyond_start start_millis_in_this_hour, in seconds: ", start_millis_in_this_hour / 1000);
														total_millis_accounted_for += start_millis_in_this_hour;
														let start_ratio_inside_this_hour = start_millis_in_this_hour / (oldest_point_inside_the_hour['t'] - hours_data[hours_into_the_past]['beyond_start_value']['t']);
														//console.log("beyond start start_ratio_inside_this_hour: ", start_ratio_inside_this_hour);
														//console.log("beyond start point outside of the hour: ", hours_data[hours_into_the_past]['beyond_start_value']['v']);
														//console.log("beyond start oldest_point_inside_the_hour['v']: ", oldest_point_inside_the_hour['v']);
														let start_value_delta = Math.abs(oldest_point_inside_the_hour['v'] - hours_data[hours_into_the_past]['beyond_start_value']['v']);
														//console.log("beyond start start_value_delta: ", start_value_delta);
														
														start_value_delta = start_value_delta * start_ratio_inside_this_hour;
														//console.log("beyond start start_value_delta after applying ratio: ", start_value_delta);
														
														if(hours_data[hours_into_the_past]['beyond_start_value']['v'] > oldest_point_inside_the_hour['v']){
															hypothetical_value_at_start_of_hour = oldest_point_inside_the_hour['v'] + start_value_delta;
														}
														else{
															hypothetical_value_at_start_of_hour = oldest_point_inside_the_hour['v'] - start_value_delta;
														}
														
														//console.log("hypothetical_value_at_start_of_hour: ", hypothetical_value_at_start_of_hour);
														//raw_nuance.push({'m':start_millis_in_this_hour,'v':((hypothetical_value_at_start_of_hour + oldest_point_inside_the_hour['v']) / 2 )});
														//nuanced_values.push( ((hypothetical_value_at_start_of_hour + oldest_point_inside_the_hour['v']) / 2 ) * start_millis_in_this_hour);
														
														const beyond_start_score = ((hypothetical_value_at_start_of_hour + oldest_point_inside_the_hour['v']) / 2 ) * (start_millis_in_this_hour / 1000);
														//console.log("adding beyond_startscore, in seconds: ", beyond_start_score / 1000);
														
														total_score += beyond_start_score;
														delete hours_data[hours_into_the_past]['beyond_start_value'];
													}
													
													delete hours_data[hours_into_the_past]['values_to_average'];
													
													//console.log("SANITY CHECK: total minutes accounted for this hour: ", Math.round(total_millis_accounted_for / 60000));
													
													const final_average = Math.round((total_score / (total_millis_accounted_for / 1000)) * 1000) / 1000;
													if(this.debug){
														console.warn("\n\n\ndashboard debug: log: hour's final_average: ", hours_into_the_past, " -> ", final_average, "\n\n\n");
													}
													hours_data[hours_into_the_past]['average'] = final_average;
													
													if(typeof alt_log_data[ ((alt_log_data.length - 1) - hours_into_the_past) ] == 'undefined'){
														console.error("dashboard debug:  log: missing index in alt_log_data: ", (alt_log_data.length - hours_into_the_past));
													}
													else{
														alt_log_data[ ( (alt_log_data.length - 1) - hours_into_the_past) ]['v'] = final_average;
													}
													
													
												}
											
											} // end of numeric log averaging process that happens when we switch to (an) hour(s) further into the past
											
											
											
											
											
											let old_hours_into_the_past = hours_into_the_past;
											if(this.debug){
												console.log("dashboard debug: ==> old hours_into_the_past is now: ", old_hours_into_the_past);
											}
											
											
											// calculate how many hours into the past we've traveled now
											//hours_into_the_past += Math.floor((start_of_this_hour - this_date_stamp) / (60 * 60 * 1000));
											
											hours_into_the_past = Math.floor( ((hours_data[0]['end']) - this_date_stamp) / (60 * 60 * 1000));
											if(this.debug){
												console.log("dashboard debug: ==> new hours_into_the_past: ", hours_into_the_past, "HOUR JUMP: ", hours_into_the_past - old_hours_into_the_past);
											}
											
											//console.warn("... hours_into_the_past is now: " + hours_into_the_past);
											
											if(hours_into_the_past == old_hours_into_the_past){
												console.error("dashboard debug: log averages: hours in the past did not increase!");
												hours_into_the_past++;
											}
											
											// and set the boundaries for this hour
											start_of_this_hour = this_date_stamp - (this_date_stamp % (60 * 60 * 1000));
											end_of_this_hour = start_of_this_hour + (60 * 60 * 1000);
											//console.log("start_of_this_hour is now: ", start_of_this_hour);
											
											hours_data[hours_into_the_past]['start'] = start_of_this_hour;
											hours_data[hours_into_the_past]['end'] = end_of_this_hour;
											
											// Similar to the beyond_start_value, we keep track of the value outside of the hour that will be useful later to calculate averages
											if(is_boolean_log == false && next_date_stamp != null && next_value != null){
												//console.log("adding beyond_end_value into the numeric hour that is now complete");
												hours_data[hours_into_the_past]['beyond_end_value'] = {'t':next_date_stamp, 'v':next_value};
											}
											
											if(this.debug){
												console.log("dashboard debug: min_max_lines_would_be_nice: ", min_max_lines_would_be_nice);
												//console.error("hours_data: ", hours_data);
											}
											
										} // end of calculating hour average
										
										
										// If it's a boolean log, we're interested in how much of the hour it was 'on'.
										// So we remembered the last time it was switched off in future_boolean_off_date_stamp
										
										if(is_boolean_log){
											if(this_value === 1){
												
												if(dp == log_data.length - 1){
													// the very first datapoint we handle is one in which the switch was enabled. We can assume it has been on since that time, until now.
													if(this.debug){
														console.log("The first boolean datapoint was 'ON'.");
													}
													
													/*
													if(this_date_stamp > start_of_this_hour){
														hours_data[hours_into_the_past]['above_zero'] += (now_timestamp - this_date_stamp);
													}
													*/
													
													
													// Pretend that the device was switched off right now
													
													future_boolean_off_date_stamp = now_timestamp;
													last_boolean_off_hour = 0;
													future_boolean_off_hour_start = start_of_this_hour;
													
												}
												
												if(future_boolean_off_date_stamp != null && last_boolean_off_hour != null){
													// We've spotted an OFF datapoint before, and this timestamp is for an event further in the past where the switch was enabled. Time to do some calculations.
													
													if(this_date_stamp > start_of_this_hour && this_date_stamp < end_of_this_hour){
														
														// Does the other moment reach over the hour boundary? If so, that complicates calculations a bit.
														if(future_boolean_off_date_stamp > end_of_this_hour){
															//console.log("the device was switched on in this hour: ", hours_into_the_past, ", and was switched of in the future, so at less hours into the past.. last_boolean_off_hour: ", last_boolean_off_hour);
															// There are three sections to update. The first is the bit in this hour (where it was switched on) until the end of this hour. The second part is the partial bit of the hour during which it was switched off again (which lies in the future).
															// And thirdly, optionally, there may be an hour or more in between those two partial hours during which the switch was on too.
													
															// update the duration that the switch was on in this hour
															hours_data[hours_into_the_past]['above_zero'] += (end_of_this_hour - this_date_stamp);
													
															// update the duration that the switch was on during the hour in which it was switched off
															//hours_data[last_boolean_off_hour]['above_zero'] += (end_of_this_hour - this_date_stamp);
															if(last_boolean_off_hour != hours_into_the_past && future_boolean_off_date_stamp != null){
																hours_data[last_boolean_off_hour]['above_zero'] += (future_boolean_off_date_stamp - future_boolean_off_hour_start);
															}
														
														
														
															if(hours_into_the_past > last_boolean_off_hour + 1){
																//console.log("Also have to fill in lots of hours in between:  from hours_into_the_past: ", hours_into_the_past, ", till last_boolean_off_hour: ", last_boolean_off_hour, ", so this many hours: ", last_boolean_off_hour - hours_into_the_past);
																// Loop over all the hours in the future, up to the one in which it was switched off, and set the 'on' duration to the entire hour.
																for(let nh = last_boolean_off_hour + 1; nh < hours_into_the_past; nh++){
																	hours_data[nh]['above_zero'] = 60 * 60 * 1000; // it must have been on for the full hour
																	//console.log("this hour has been set to the full 60 minutes: ", nh);
																}
															}
														
													
														}
														else{
														
															
														
														
															// nice and simple..?
															
															const time_delta_with_the_hour = future_boolean_off_date_stamp - this_date_stamp;
															
															if(this.debug){
																console.warn("the device was switched on in this hour: ", hours_into_the_past, ", and was switched of in the same hour. So last_boolean_off_hour should be the same: ", last_boolean_off_hour);
																console.log("switch was briefly on within the hour. So minutes on (from time_delta_with_the_hour) should be less than 60): ", Math.round(time_delta_with_the_hour/60000));
															}
															
															if(hours_data[hours_into_the_past]['above_zero'] > (60 * 60 * 1000)){
																console.error("dashboard: the accumulated boolean ON time has already exceeded 60 minutes! ", hours_data[hours_into_the_past]['above_zero'] / 60000);
															}
												
															hours_data[hours_into_the_past]['above_zero'] += time_delta_with_the_hour;
											
															if(hours_data[hours_into_the_past]['above_zero'] > (60 * 60 * 1000)){
																console.error("dashboard: after adding the latest boolean delta, the accumulated ON time has now exceeded 60 minutes! ", hours_data[hours_into_the_past]['above_zero'] / 60000);
															}
														
														
															/*
															let timestamp_of_next_point_or_hour_limit = next_date_stamp;
															if(next_date_stamp >= end_of_this_hour){
																timestamp_of_next_point_or_hour_limit = end_of_this_hour;
															}
															above_zero += (timestamp_of_next_point_or_hour_limit - this_data_stamp);
															*/
														
														}
													}
													else{
														//console.warn("dashboard: the boolean datapoint we're looking at is not for this hour!");
													}
													
													// reset
													future_boolean_off_date_stamp = null;
													last_boolean_off_hour = null;
													future_boolean_off_hour_start = null;
												}
												else{
													if(this.debug){
														console.warn("dashboard: boolean log averaging: spotted a datapoint in which the device on turned ON, but there is no remembered datapoint that indicates when in the future it was turned off!");
													}
												}
												
											}
											else if(future_boolean_off_date_stamp == null){
												if(this.debug){
													console.log("dashboard debug: log averages: remembering when the device was switched off. remembering this_date_stamp and hours_into_the_past: ", this_date_stamp, hours_into_the_past);
												}
												future_boolean_off_date_stamp = this_date_stamp;
												last_boolean_off_hour = hours_into_the_past;
												future_boolean_off_hour_start = start_of_this_hour;
											}
											else{
												if(this.debug){
													console.warn("dashboard debug: oddly, there are two datapoints in a row that indicate the device was OFF");
												}
												
											}
											
											//console.log("BOOLEAN hours_data: ", hours_data);
											
										}
										else{
											// Update spotted minimum and/or maximum value for this hour
											//console.log("INSIDE HOUR? ", start_of_this_hour, this_date_stamp, end_of_this_hour);
											if(this_date_stamp >= start_of_this_hour && this_date_stamp < end_of_this_hour){
											
												if(hours_data[hours_into_the_past]['minimum'] == null){
													hours_data[hours_into_the_past]['minimum'] = this_value
												}
												else if(this_value < hours_data[hours_into_the_past]['minimum']){
													//console.log("spotted lower minimum: ")
													hours_data[hours_into_the_past]['minimum'] = this_value;
												}
									
												if(hours_data[hours_into_the_past]['maximum'] == null){
													hours_data[hours_into_the_past]['maximum'] = this_value;
												}
												else if(this_value > hours_data[hours_into_the_past]['maximum']){
													hours_data[hours_into_the_past]['maximum'] = this_value;
												}
											
												hours_data[hours_into_the_past]['values_to_average'].push({"t":this_date_stamp, "v":this_value});
											
											}
											else{
												//console.error("dashboard: log averages: this numeric datapoint is somehow not within the hour we're looking at");
											}
										}
										
										
											
										
										
										
										if(is_boolean_log == false && min_max_lines_would_be_nice == false && hours_data[hours_into_the_past]['minimum'] != null && hours_data[hours_into_the_past]['maximum'] != null){
											if(hours_data[hours_into_the_past]['minimum'] != hours_data[hours_into_the_past]['maximum']){
												if(hours_data[hours_into_the_past]['minimum'] > hours_data[hours_into_the_past]['maximum']){
													console.error("dashboard: somehow maximum value spotted this hour was smaller than the minimum value spotted: ", hours_data[hours_into_the_past]['minimum'], hours_data[hours_into_the_past]['maximum']);
												}
												else{
													//console.log("spotted a different minimum and maximum value this hour, so min-max lines would be nice.  hour,min,max: ", hours_into_the_past, hours_data[hours_into_the_past]['minimum'], hours_data[hours_into_the_past]['maximum'])
													min_max_lines_would_be_nice = true;
												}
												
											}
										}
										
										
										next_value = this_value;
										next_date_stamp = this_date_stamp;
										
										/*
										if(is_boolean_log && value == 0){
											future_boolean_off_date_stamp = next_date_stamp; // remember the last seen timestamp at which point the boolean was false
											last_boolean_off_hour = hours_into_the_past; // and remember in which hour that took place.
										}
										*/
										
									} // END OF LOOPING OVER DATA POINTS TO CALCULATE AVERAGES
									
									
									
									
									
									
									
									if(is_boolean_log){
										for (let [hour_id, details] of Object.entries(hours_data)) {
											if(typeof details['above_zero'] == 'number'){
												alt_log_data[ 24 - parseInt(hour_id) ]['v'] = Math.round(details['above_zero'] / 60000);
											}
										}
										//console.error("\n\n\nboolean alt_log_data: ", log_thing_id, log_property_id, "\n", JSON.stringify(alt_log_data,null,2));
									}
									else{
										//console.error("\n\n\nnumeric alt_log_data: ", log_thing_id, log_property_id, alt_log_data);
									}
									
									
									
										
										
									
										
									//} // End of log_viz_hourly
									
									
									// PRUNING.. well trimming really. Removing older datapoints so that what remains will be rendered nicely in the available horizontal pixels
									
									if(rect.width > 50 && log_data.length > 100){
										if(this.debug){
											console.log("dashboard debug: log_data.length before pruning: ", log_data.length);
										}
										while(log_data.length > Math.floor(rect.width / 4) ){
											log_data.shift();
										}
										if(this.debug){
											console.log("dashboard debug: log_data.length after pruning: ", log_data.length);
										}
									}
									
						
						
									// For a boolean log, we add extra datapoints to create a square-wave shape
									if(is_boolean_log){
										let new_log_data = [];
										let previous_value = null;
										let previous_date = null;
										
										if(this.debug){
											console.log("dashboard debug: log_data.length before adding boolean sawtooth datapoints: ", log_data.length);
										}
										
										for(let dp = 0; dp < log_data.length; dp++){
											
											if(previous_value == null){
												previous_value = log_data[dp]['v'];
												previous_date = log_data[dp]['d'];
												//console.log("typeof log_data[dp]['d']: ", typeof log_data[dp]['d'], log_data[dp]['d']);
											}
											else if( log_data[dp]['v'] != previous_value){
												previous_value = log_data[dp]['v'];
												previous_date = log_data[dp]['d'];
												if(log_data[dp]['d'].getTime() - 1 > previous_date.getTime()){
													new_log_data.push({'v':!log_data[dp]['v'],"d":log_data[dp]['d'].setDate(log_data[dp]['d'].getSeconds() - 1)});
													//console.log("moved extra boolean datapoint a little to the past");
												}
												else{
													new_log_data.push({'v':!log_data[dp]['v'],"d":log_data[dp]['d']});
												}
												//console.log("adjusted log_data[dp]['d']: ", typeof log_data[dp]['d'], log_data[dp]['d']);
												
											}
											new_log_data.push(log_data[dp]);
										}
										log_data = new_log_data;
										
										if(this.debug){
											console.log("dashboard debug: log_data.length after adding boolean sawtooth datapoints: ", log_data.length);
										}
										
									}
									
						
					
					
					
									log_viz_el.innerHTML = '';
					
					
									
					
									// -1*(svg_padding/2)
									const svg = d3.create("svg")
								    	.attr("title", "Dataviz")
								    	.attr("version", 1.1)
								    	.attr("xmlns", "http://www.w3.org/2000/svg")
										.attr("width", rect.width + 10)
										.attr("height", rect.height + 10)
										.attr("viewBox", [-30, -10, rect.width, rect.height+20])  //  - (svg_height_padding/2)
										//.attr("style", "max-width: 100%; height: auto;");
					
									log_viz_el.appendChild(svg.node());
					
									
									// the data has been trimmed to better be able to fit the amount of available pixels
									const oldest = d3.min(log_data, d => d.d);
									const newest = Date.now(); //d3.max(log_data, d => d.d); // with the old method the time delta between the first and last data point is interesting, but it's not useful for saying "showing data from X minutes ago", since the timespan for which data is availble may be far in the past
									const delta_millis = newest - oldest;
						
									const delta_millis_until_now = Date.now() - oldest;
									if(delta_millis_until_now > 120000){
										//console.log("creating log description element");
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
		    							.range([10, rect.width - 20])
					

									const minimum_y_value = d3.min(log_data, d => d.v);
									const maximum_y_value = d3.max(log_data, d => d.v)
									const yScale = d3.scaleLinear()
										.domain([minimum_y_value, maximum_y_value])
										.range([rect.height - 20, 10])
										
									//console.log("D3 minimum_y_value: ", minimum_y_value);
						
									//console.log("yScale of minimum_y_value (should be 0): ", yScale(minimum_y_value));
						
									/*
									if(is_boolean_log == false){
										svg.append("g")
										.attr("transform", `translate(10,0)`)
										.call(d3.axisLeft(yScale))  
									}
									*/
									
									let y_axis = null;
									if(is_boolean_log){
										y_axis = svg.append("g")
										.attr("transform", `translate(10,0)`)
										.call(d3.axisLeft(yScale).tickValues([0,1]).tickFormat((d, i) => ['OFF', 'ON'][i]))   // .attr("test", "test")
						
									}
									else if(tallness_hint_el == null){
										y_axis = svg.append("g")
										.attr("transform", `translate(10,0)`)
										.call(d3.axisLeft(yScale).ticks(6)) 
										 
									}
									else{
										y_axis = svg.append("g")
										.attr("transform", `translate(10,0)`)
										.call(d3.axisLeft(yScale))  
									}
									
									if(y_axis){
										y_axis
										.selectAll(".tick")
										//.attr("class", "vertical-tick")
										.attr("class", function(d,i){
											//console.log("HANDING TICK");
										 	//if(data[i].value == 11){ return "eleven"}
										 	//else if(data[i].value == 0){ return "zero"}
											return "extension-dashboard-y-tick"
										});
										
										
										
										//.call(d3.axisLeft(yScale).ticks(6))  
										
										
									}
									
									/*
var ticks = d3.selectAll(".tick text");

ticks.attr("class", function(d,i){
 if(data[i].value == 11){ return "eleven"}
 else if(data[i].value == 0){ return "zero"}
});
										
										
									*/
								
									
									
									
									 
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
					


									let horizontal_tick_count = (wideness_hint_number * 2) + 1;
									//console.log("wideness * 2 -> horizontal_tick_count: ", horizontal_tick_count);
										
									//var timeFormat = d3.timeFormat("%I:%M %p %a %Y");
									var timeFormat = null
					
									if(delta_millis > 67200000){ // 2 hours
										timeFormat = d3.timeFormat("%H"); // hourly ticks
										if(wideness_hint_number > 2){ // is_boolean_log && 
											horizontal_tick_count = Math.floor(delta_millis / (60*60*1000)); // as many ticks as there are hours
										}
									}
									else if(delta_millis > 300000){ // 5 minutes
										timeFormat = d3.timeFormat("%H:%M"); // tick on minutes
									}
									else{
										timeFormat = d3.timeFormat("%S"); // tick on seconds
									}
									if(timeFormat){
										
										
										
								    	let x_axis = svg.append("g")
								        	.attr("transform", `translate(0,${rect.height - 20})`)
								        	.call(d3.axisBottom(xScale).tickSizeOuter(0).ticks(horizontal_tick_count).tickPadding(5).tickFormat(timeFormat))
										
										if(x_axis){
											x_axis
											.selectAll(".tick")
											.attr("class", function(d,i){
												return "extension-dashboard-x-tick"
											});
										
										
										
											//.call(d3.axisLeft(yScale).ticks(6))  
										
										
										}
										
										
										
										
										
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
									.attr("transform", `translate(0,0)`)
									.attr("class", "extension-dashboard-log-tooltip-data")
							        .attr("height", (d) => {
										/*
										if(log_thing_id.endsWith("24")){
											console.log("log_id: ", log_id, log_thing_id, log_property_id);
											console.log("adding vertical tooltip lines.  yScale(0), yScale(d.v): ", yScale(0), yScale(d.v) );
											console.log("height would return: ", yScale(0) - yScale(d.v));
										}
										*/
										
										//yScale(minimum_y_value)
										
										return yScale(minimum_y_value) - yScale(d.v)
										
									})
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
											
											function human_readable_time(d){
												if(d.getHours){
													const hours = d.getHours();
													let minutes = d.getMinutes();
													if(minutes < 10){
														minutes = '0' + minutes;
													}
													return hours + ":" + minutes;
												}
												return '';
												
											}
											
											if(is_boolean_log){
									    		tooltip
												.text(human_readable_time(d.target['__data__']['d']))
												.style("cursor", "pointer")
												.style("left",tooltip_x + "px") 
												.style("top", tooltip_y + "px")
												.style("color", "#333333");
											}
											else{
									    		tooltip
												.text(limit_decimals(d.target['__data__']['v']))
												.style("cursor", "pointer")
												.style("left",tooltip_x + "px") 
												.style("top", tooltip_y + "px")
												.style("color", "#333333");
											}
									    	

								
										}
										catch(err){
											console.error("dashboard: caught error in dataviz onMouseOver: ", err);x
										}

									}

									function onMouseOut(d){

									    tooltip.transition()        
									          .duration(500)      
									          .style("opacity", 0);  
									}

						
						
						
						
						
						
						
						
									
									
									
									
									
									
									
									//
									//
									//   B A R C H A R T
									//
									//
									
									
									const generate_alternate_chart = (log_viz_el=null,log_data=null) => {
										//log_viz_el.innerHTML = '';
					
										if(log_viz_el == null){
											return null;
										}
										
										if(log_data == null){
											return log_viz_el;
										}
										
										log_viz_el.innerHTML = '';
										
										
					
										// -1*(svg_padding/2)
										const svg = d3.create("svg")
									    	.attr("title", "Alternate dataviz")
									    	.attr("version", 1.1)
									    	.attr("xmlns", "http://www.w3.org/2000/svg")
											
											.attr("width", rect.width)
											.attr("height", rect.height)
											//.attr("viewBox", [-30, -30, rect.width + 40, rect.height + 60])  //  - (svg_height_padding/2)
											.attr("viewBox", [0, 0, rect.width, rect.height])  //  - (svg_height_padding/2)
											/*
											.attr("width", rect.width + 10)
											.attr("height", rect.height + 10)
											.attr("viewBox", [-10, -10, rect.width, rect.height+20])  //  - (svg_height_padding/2)
											*/
											
											//.attr("style", "max-width: 100%; height: auto;");
					
										log_viz_el.appendChild(svg.node());
					
									
										
										const highest = d3.max(log_data, d => d.v);
										const lowest = d3.min(log_data, d => d.v);
										const oldest = d3.min(log_data, d => d.d);
										
									  	// X axis
									  	var x = d3.scaleBand()
									    .range([ 20, rect.width - 40 ])
									    .domain(log_data.map(function(d) { return d.d; })) // console.log("setting bar X tick to: ", d.d); 
									    .padding(0.2);
										
										
										/*
									  	svg.append("g")
									    .attr("transform", "translate(0," + rect.height + ")")
									    .call(d3.axisBottom(x))
									    .selectAll("text")
									      .attr("transform", "translate(-10,0)rotate(-45)")
									      .style("text-anchor", "end");
										*/
										
										let horizontal_tick_count = log_data.length;
	  									//var timeFormat = d3.timeFormat("%I:%M %p %a %Y");
	  									var timeFormat = d3.timeFormat("%H");
					
										/*
										var formatDay = function(d) {
											console.log("formatDay: d: ", d);
										    return "Hello world"; //weekdays[d % 7] + "day";      
										}
										*/
					
	  								    let x_axis = svg.append("g")
	  								        .attr("transform", `translate(30,${rect.height - 30})`)
	  								        .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%H")))   //  timeFormat   //  .tickSizeOuter(0).ticks(horizontal_tick_count).tickPadding(5).tickFormat(timeFormat)
								    		.selectAll("text")
								      		.attr("transform", "translate(0,0)rotate(-45)") // was -10,0
											.attr("class", "extension-dashboard-x-tick")
								      		.style("text-anchor", "end");
							    			/*
											.selectAll(".tick text")
											.attr("class", function(d,i){
												return "tick-text tick-text-month" + d.getUTCMonth();
											});
											*/
	  										
	  								    		
										
	  									if(x_axis){
	  										x_axis
	  										.selectAll(".tick")
	  										.attr("class", function(d,i){
	  											return "extension-dashboard-x-tick";
	  										});
	  									}
										
										
										let domain_max = highest;
										
										if(is_boolean_log){
											domain_max = 60; // minutes in the hour that the device was on
										}

									  	// Add Y axis
									  	var y = d3.scaleLinear()
									    .domain([0, domain_max])
									    .range([ rect.height, 40]);
									  
									  	let y_axis = svg.append("g")
										.attr("transform", `translate(50,-30)`)
									    .call(d3.axisLeft(y))
								    	.selectAll(".tick")
										.attr("class", "extension-dashboard-y-tick");




									
										function onBarMouseOver(d){
											//console.log("in onBarMouseOver. d: ", d);
											
									    	tooltip
												.transition()        
												.duration(200)      
												.style("opacity", 1);    


											const tooltip_x = d.pageX - 12;
											const tooltip_y = d.pageY + 25;
											
								    		tooltip
											//.text(d.target['__data__']['h'] + ". " + d.target['__data__']['v'])
											.text(d.target['__data__']['v'])
											.style("cursor", "pointer")
											.style("left",tooltip_x + "px") 
											.style("top", tooltip_y + "px")
											.style("color", "#333333");
										}
										function onBarMouseOut(){
											//console.log("in onBarMouseOut");
								    		tooltip.transition()        
											.duration(500)      
											.style("opacity", 0);
										}
										
										
										
									  	// Bars
									  	svg.selectAll("mybar")
									    .data(log_data)
									    .enter()
									    .append("rect")
										  .attr("transform", `translate(30,-30)`)
									      .attr("x", function(d) { return x(d.d); })
									      .attr("y", function(d) { return y(d.v); })
											.attr("class", "extension-dashboard-widget-log-bar-bar")
									      .attr("width", x.bandwidth())
									      .attr("height", function(d) { return rect.height - y(d.v); })
									      .attr("fill", "#69b3a2")
										
										.on("mouseover", (d) => onBarMouseOver(d))                  
										.on("mouseout", onBarMouseOut)
										

										


										//})
										
										let time_delta_description_el = document.createElement("div");
										time_delta_description_el.classList.add('extension-dashboard-widget-log-time-description');
										
										time_delta_description_el.textContent = 'Hourly averages'; //'Averages over last ' + log_data.length + ' hours';
										log_viz_el.appendChild(time_delta_description_el);
										
										return log_viz_el;
						
						
									}
									
									
									
									try{
										// Prune starting null values from alt_log_data, and change any null values in between valid datapoints into zero (of the minimum value?).
									
										//const initial_alt_log_data_length = alt_log_data.length;
									
										const minimum_y_value_despite_potential_null_values = d3.min(alt_log_data, d => d.v);
										console.log("minimum_y_value_despite_potential_null_values: ", typeof minimum_y_value_despite_potential_null_values, minimum_y_value_despite_potential_null_values);
									
										//let spotted_valid_value = false;
										//console.log("null trimmiing: initial_alt_log_data_length: ", initial_alt_log_data_length);
										//for(let pa = alt_log_data.length - 1; pa >= 0; pa--){
									
										let initial_nulls_count = 0;
										for(let pa = 0; pa < alt_log_data.length - 1; pa++){
										
											if(typeof alt_log_data[pa] != 'undefined'){
												if(alt_log_data[pa]['v'] != null){
													//spotted_valid_value = true;
													initial_nulls_count = pa + 1;
													break
												}
												/*
												console.log(pa + ". trimming nulls: ", alt_log_data[pa]['v']);
											
												if(alt_log_data[pa]['v'] == null){
													alt_log_data.splice(pa,1);
													pa--;
													console.log("trimmed a null");
												
												}
											
										
												if(alt_log_data[pa]['v'] == null){
													alt_log_data[pa]['v'] = 0;
												}
												*/
											}
											else{
												console.error("dashboard: undefined item in alt_log_data array?");
												break;
											}
										
										}
										console.log("initial_nulls_count: ", initial_nulls_count);
										if(initial_nulls_count){
											alt_log_data.splice(0,initial_nulls_count);
											console.log("alt_log_data.length after pruning nulls from beginning: ", alt_log_data.length);
										}
									
									
										for(let pn = 0; pn < alt_log_data.length - 1; pn++){
											if(alt_log_data[pn]['v'] == null){
												alt_log_data[pn]['v'] = 0;
											}
										}
									}
									catch(err){
										console.error("caught error in pruning null values from alt_log_data: ", err);
									}
									
									
									
									
									
									
									
									//log_viz_el.innerHTML = '';
									
									
									log_viz_el.classList.add('extension-dashboard-hidden'); // temporarily hide it so that generate_alternate_chart has real dimensions to work with
									
									if(log_viz_el2 == null){
										log_viz_el2 = document.createElement('div');
										log_viz_container_el.appendChild(log_viz_el2);
									}
									else{
										log_viz_el2.classList.remove('extension-dashboard-hidden');
									}
									
									const bar_chart_el = generate_alternate_chart(log_viz_el2,alt_log_data);
									//console.log("bar_chart_el: ", bar_chart_el);
									
									log_viz_el.classList.remove('extension-dashboard-hidden');
									
									
									log_viz_el.classList.add("extension-dashboard-widget-checkbox-toggle-unchecked-content");
									log_viz_el.classList.add("extension-dashboard-widget-log-viz");
									log_viz_el.classList.add("extension-dashboard-flex-column");
									log_viz_el2.classList.add("extension-dashboard-widget-checkbox-toggle-checked-content");
									log_viz_el2.classList.add("extension-dashboard-widget-log-viz");
									log_viz_el2.classList.add("extension-dashboard-flex-column");
									
						
						
					
								}
				
							}
						}
		
					}
				}
				else{
					if(this.debug){
						console.error("dashboard: render_logs: no valid this.logs_data? ", this.logs_data);
					}
					
				}
				
			})
			.catch((err) => {
				if(this.debug){
					console.error("dashboard: render_logs: caught error from load_logs_data: ", err);
				}
			});
			
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
				
					if(i == this.current_grid_id){
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

        update_clocks() {
			if(this.debug){
				//console.log("dashboard debug: in update_clocks.  update_clock: ", this.update_clock);
			}
            if (this.update_clock) {
				
				if(this.last_time_clock_updated > Date.now() - 2){
					//console.warn("dashboard debug: already updated the clock recently");
					return
				}
				this.last_time_clock_updated = Date.now();
				
                window.API.postJson(
                    `/extensions/dashboard/api/get_time`,
                ).then((body) => {
                    if (typeof body.hours != 'undefined') {


						// TIME
                        var hour_padding = "";
                        var minute_padding = "";
						let updated_time = body.hours + ":" + minute_padding + body.minutes;

						let clock_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-time');
						if(clock_els.length){
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
						if(day_els.length){
							for(let de = 0; de < day_els.length; de++){
								day_els[de].textContent = nice_day_name;
							}
						}
						
						
						// DATE
						let date_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-date-date');
						if(date_els.length){
							for(let de = 0; de < date_els.length; de++){
								date_els[de].textContent = body.date;
							}
						}
						
						//console.log("dashboard: update_clocks: body.date: ", body.date);
						//console.log("dashboard: update_clocks: body.month: ", body.month);
						
						// MONTH
                        //const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                        //document.getElementById('extension-dashboard-date-month').innerText = body.month; //months[date.getMonth()];
						let month_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-date-month');
						if(month_els.length){
							for(let me = 0; me < month_els.length; me++){
								month_els[me].textContent = body.month;
							}
						}
						
						
						//const then = new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0)
						
						
						
						
						let analog_hour_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-analog-hour');
						if(analog_hour_els.length){
							
							const hour_rotation_degrees =  body.hours * 30 + body.minutes * (360/720);
						
							let seconds = new Date().getSeconds();
							//console.log("dashboard debug: update_clocks: seconds: ", seconds);
							//seconds = seconds + 45;
							//seconds = seconds % 60;
							//console.log("local seconds: ", seconds);
							let minute_rotation_degrees = body.minutes * 6 + seconds * (360/3600);
							
							for(let be = 0; be < analog_hour_els.length; be++){
								analog_hour_els[be].style.transform = "rotate(" + hour_rotation_degrees + "deg)"; // (body.hours * 30 + (body.hours / 2))
							}
							
							let analog_minute_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-analog-minute');
							//console.log("analog_minute_els: ", analog_minute_els, typeof body.minutes, body.minutes);
							if(analog_minute_els.length){
								for(let bm = 0; bm < analog_minute_els.length; bm++){
									analog_minute_els[bm].style.transform = "rotate(" + minute_rotation_degrees + "deg)";
								}
							}
							
							if(seconds != 0){
								let analog_second_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-analog-second');
								//console.log("analog_second_els: ", analog_second_els);
								if(analog_second_els.length){
									for(let bs = 0; bs < analog_second_els.length; bs++){
										if(analog_second_els[bs].style.animationDelay == ''){
											//console.log("adding animation_delay: -" + animation_delay + "s");
											analog_second_els[bs].style.animationDelay = "-" + seconds + "s";
										}
										
									}
								}
							
							}
							
						}
						
                    }
					
                }).catch((err) => {
                    if(this.debug){
						console.error("dashboard: error getting date/time from backend: ", err);   
					}
                });
            }
        }







		//
		//  VOCO TIMERS OVERLAY
		//


		// Get list of Voco timers from api every 5 seconds
        get_poll() {
			if (this.debug) {
				//console.log("dashboard debug: in get_poll, polling for voco actions");
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
							//console.log("dashboard debug: get_poll: new Voco action_times: ", this.action_times);
						}
					}
				}
            }).catch((err) => {
                if (this.debug) {
					console.error("dashboard: error doing periodic poll for voco actions: ", err);
				}
				this.poll_fail_count = 12; // delays 12 * 5 seconds
            });
        }
		
		
		
		
		// Update the HTML of Voco timers
		update_voco_actions(){
			const d = new Date();
			let time = Math.floor(d.getTime() / 1000);
			
			let voco_els = this.view.querySelectorAll('.extension-dashboard-widget-voco');
			for(let vw = 0; vw < voco_els.length; vw++){
				const voco_overlay_el = voco_els[vw];
				
				for (let i = 0; i < this.action_times.length; i++) {
					const action = this.action_times[i];
					
				
					try{
						if(typeof action.slots.timer_type == 'string'){
							const delta = action.moment - time;
							const item_id = "extension-dashboard-voco-" + action.intent_message.sessionId;
							//console.log("voco action item ID: ", item_id);
							
							let action_el = voco_overlay_el.querySelector("." + item_id);
							
							if(delta >= 0 && delta < 3600 * 24){ // && delta < 3600
							
								if(this.debug){
									//console.log("dashboard debug: Voco item_id, delta: ", item_id, delta);
								}
							
								if(action_el == null){
									if(this.debug){
										//console.log("dashboard: creating new voco timer DOM element");
									}
									action_el = document.createElement('div');
									action_el.classList.add('extension-dashboard-voco-item');
									action_el.classList.add(item_id);
									action_el.classList.add('extension-dashboard-voco-item-' + action.slots.timer_type);
									action_el.innerHTML =  '<img src="/extensions/dashboard/images/' + action.slots.timer_type + '.svg"/><div class="extension-dashboard-voco-item-time"><span class="extension-dashboard-widget=hide-if-thin">in&nbsp;</span><span class="extension-dashboard-voco-item-hours"></span><span class="extension-dashboard-voco-item-minutes"></span><span class="extension-dashboard-voco-item-seconds"></span></div>';
									action_el.innerHTML += '<div class="extension-dashboard-voco-item-info"><h4 class="extension-dashboard-voco-item-title">' + action.slots.sentence + '</h4></div>';
									voco_overlay_el.appendChild(action_el);
								}
								else{
									if(this.debug){
										//console.log("dashboard: voco action_el already existed");
									}
								}
								
								let hours = '';
								let minutes = Math.floor(delta / 60);
								if(minutes > 60){
									hours = Math.floor(minutes/60);
									action_el.querySelector('.extension-dashboard-voco-item-hours').innerText = hours;
								}
								
								let seconds = Math.floor(delta % 60);
								
								
								
								
								
								
								minutes = minutes % 60;
								if(minutes == 0){
									if(hours == 0){
										minutes = ''
									}
									else{
										minutes = '00';
									}
								}
								else if(minutes < 10){minutes = '0' + minutes}
								
								
					
								if(minutes == '' && seconds == 0){seconds = ''}
								else if(seconds < 10){seconds = '0' + seconds}
								
								action_el.querySelector('.extension-dashboard-voco-item-hours').innerText = hours;
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
						if(this.debug){
							console.error("dashboard: error parsing Voco timer: ", e);
						}
					}
				
					if(i > 9){
						break;
					}
				
				}
				
			}
			
			
			
			// Update the alarm hands on clock widgets
			let clock_alarm_els = this.view.querySelectorAll('.extension-dashboard-widget-clock-analog-alarm');
			if(clock_alarm_els.length){
				
				let alarm_time = null;
				for (let it = 0; it < this.action_times.length; it++) {
					if(typeof this.action_times[it].slots.timer_type == 'string' && typeof this.action_times[it].moment == 'number'){
						//console.log("checking voco item or type: ", this.action_times[it].slots.timer_type);
						// Remember the best time for the alarm hand on any visible clock
						if(this.action_times[it].slots.timer_type == 'wake' || (this.action_times[it].slots.timer_type == 'alarm' && alarm_time == null)){
							alarm_time = this.action_times[it].moment;
						}
					}
				}
				
				for (let ca = 0; ca < clock_alarm_els.length; ca++) {
					if(alarm_time != null){
					
						const alarm_date = new Date(alarm_time * 1000);
						if(alarm_date){
						
							const hours = alarm_date.getHours() % 12; // || 12;
							const minutes = alarm_date.getMinutes(); // || 12;
							const alarm_rotation_degrees = hours * 30 + minutes * (360/720);
				
							clock_alarm_els[ca].style.transform = "rotate(" + alarm_rotation_degrees + "deg)"; // (body.hours * 30 + (body.hours / 2))
							clock_alarm_els[ca].classList.remove('extension-dashboard-hidden');
						}
					
					}
					else{
						clock_alarm_els[ca].classList.add('extension-dashboard-hidden');
					}
				}
			}
			
			
		}

		
		get_moon(){
			var Moon = {
			  //phases: ['new-moon', 'waxing-crescent-moon', 'quarter-moon', 'waxing-gibbous-moon', 'full-moon', 'waning-gibbous-moon', 'last-quarter-moon', 'waning-crescent-moon'],
			  phases: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'], // 🌑
			  
			  
			  phase: function (year, month, day) {
			    let c = 0;
				let e = 0;
				let jd = 0;
				let b = 0;

			    if (month < 3) {
			      year--;
			      month += 12;
			    }

			    ++month;
			    c = 365.25 * year;
			    e = 30.6 * month;
			    jd = c + e + day - 694039.09; // jd is total days elapsed
			    jd /= 29.5305882; // divide by the moon cycle
			    b = parseInt(jd); // int(jd) -> b, take integer part of jd
			    jd -= b; // subtract integer part to leave fractional part of original jd
			    b = Math.round(jd * 8); // scale fraction from 0-8 and round

			    if (b >= 8) b = 0; // 0 and 8 are the same so turn 8 into 0
			    //return {phase: b, name: Moon.phases[b]};
				return Moon.phases[b];
			  }
			};

			// Moon.phase('2018', '01', '19');
			var today = new Date();
			return Moon.phase(today.getFullYear(), today.getMonth()+1, today.getDate());

		}
		
		
		update_moon(){
			let moon_els = this.view.querySelectorAll('.extension-dashboard-widget-weather-moon-container');
			if(moon_els){
				const moon_emoji = this.get_moon();
				for(let m = 0; m < moon_els.length; m++){
					moon_els[m].textContent = moon_emoji;
				}
			}
		}

		
        // HELPER METHODS
		// TODO Are these still used? once..

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