let fm;
export class LiveSwitch{
    constructor({applicationId,sharedSecret,deviceId,channelId,userName="Annonymous",layoutStage , withAudio= true , withVideo = true , connectionMode="p2p",logging = false}){
        fm = window.fm;
        this.applicationId = applicationId;
        this.sharedSecret = sharedSecret;
        this.deviceId = deviceId;
        this.channelId = channelId;
        this.connectionMode = connectionMode;
        this.userName=userName;
        // local media 
        this.localMedia = new fm.liveswitch.LocalMedia(withAudio, withVideo);
        this.screenMedia = new fm.liveswitch.LocalMedia(false, true,true);
        // 
        this.localaudio = null;
        this.localvideo = null;
        //
        this.layoutStage = layoutStage;
        if(this.layoutStage){
            this.localLayoutManager  = new fm.liveswitch.DomLayoutManager(layoutStage);
        }
        this.channel = null;
        this.shareScreenConnections = [];
        this.p2pConnections = [];
        this.remoteP2PPeers = [];

        this.fmClient =  new fm.liveswitch.Client(process.env.GATEWAY_URL, applicationId );
        this.fmClient.setAutoUnregister(true);
        if(logging){
            fm.liveswitch.Log.setLogLevel(fm.liveswitch.LogLevel.Debug);
            fm.liveswitch.Log.registerProvider(new fm.liveswitch.ConsoleLogProvider(fm.liveswitch.LogLevel.Debug));
        }
    }
    setUserName(userName){
        this.userName = userName;
    }
    setChannelId(channelId){
        this.channelId = channelId;
    }
    setLayoutStage(layoutStage){
        this.layoutStage = layoutStage;
        if(this.localLayoutManager){
            this.localLayoutManager = null;
        }
        this.localLayoutManager =new fm.liveswitch.DomLayoutManager(layoutStage);
    }
    async startLocalMedia({levelChangeHandler}){
        try{
            await this.localMedia.start();
            if(levelChangeHandler){
                this.localMedia.addOnAudioLevel(levelChangeHandler);
            }
            this.localLayoutManager.setLocalView(this.localMedia.getView());
            return true;
        }
        catch(err){
            console.log(err);
            return false;
        }
    }
    async updateLocalMediaAudioSource(source){
        try{
            await this.localMedia.changeAudioSourceInput(source);
            return true;
        }
        catch(err){
            console.log(err);
            return false;
        }
    }
    async updateLocalMediaVideoSource(source){
        try{
            await this.localMedia.changeVideoSourceInput(source);
            return true;
        }
        catch(err){
            console.log(err);
            return false;
        }
    }
    async stopLocalMedia(){
        try{
            await this.localMedia.stop();
            return true;
        }
        catch(err){
            console.log(err);
            return false;
        }
    }
    async joinChannel(handlerCallbacks,userName){
        if(userName){
            const config = this.fmClient.getConfig();
            config.setUserAlias(userName);
            this.fmClient.update(config);
        }
        const joinToken = fm.liveswitch.Token.generateClientJoinToken(
            this.fmClient,
            new fm.liveswitch.ChannelClaim(this.channelId),
            this.sharedSecret
        );
        try{
            const channel= await this.fmClient.join(this.channelId, joinToken);
            this.channel = channel;
            this.setupChannelHandlers(handlerCallbacks);
            return true;
        }
        catch(err){
            console.log(err);
            return false;
        }
    }
    async toggleShareSession(){
        if(!this.channel){
           return false;
         }
        if(this.shareScreenConnections.length){
          this.shareScreenConnections.forEach((connection)=>{
              connection.close();
          });
          try{
                this.screenMedia.stop();
                this.screenMedia.destroy();
                this.localLayoutManager.setLocalView(this.localMedia.getView());
                this.shareScreenConnections = [];
          }
          catch(err){
            console.log("err");
          }
          return false;
        }
        // create local media with screen capture
        try{
            await this.screenMedia.start();
            this.screenMedia.setDynamicValue("screenShare" , true);
            this.localLayoutManager.setLocalView(this.screenMedia.getView());
            this.p2pConnections.forEach(async (client)=>{
                if(client._remoteClientInfo){
                  client = client._remoteClientInfo;
                }
                //create audio stream with remote and local media handles
                const videoStream = new fm.liveswitch.VideoStream(this.screenMedia);
                const connection = this.channel.createPeerConnection(client, videoStream);
                connection.setTag("screenShare");
                if(!connection){
                  return;
                }
                this.shareScreenConnections  = [...this.shareScreenConnections , connection];
                try{
                    await connection.open();
                    console.log("Screen Share started to peer");
                }
                catch(err){
                    console.log("an error occurred");
                }
            });
            return true;
        }
        catch(err){
            console.log(err);
            return false;
        }


    }
    async register(){
        try{
            const registerToken = fm.liveswitch.Token.generateClientRegisterToken(
                this.fmClient,
                [new fm.liveswitch.ChannelClaim(this.channelId)],
                this.sharedSecret
            );
            const r= await this.fmClient.register(registerToken);
            this.channel = r.channel;
        }
        catch(err){
            console.log(err);
        }
    }
    setupChannelHandlers({
        messageHandler,
        remoteClientHandler
    }){
        if(!this.channel){
            return false;
        }
        if(this.connectionMode === "p2p"){
            this.channel.addOnPeerConnectionOffer(function(peerConnectionOffer) {
                // check for screenshare connections
                const isScreenShare = peerConnectionOffer.getConnectionTag() === "screenShare";
                //create remote media handle
                const remoteMedia = new fm.liveswitch.RemoteMedia();
                //create audio stream with remote and local media handles
                let audioStream;
                if(peerConnectionOffer._hasAudio){
                    audioStream = new fm.liveswitch.AudioStream(this.localMedia, remoteMedia);
                }
                const videoStream = new fm.liveswitch.VideoStream(this.localMedia, remoteMedia);
                //create connection to peer
                const connection = this.channel.createPeerConnection(peerConnectionOffer, audioStream, videoStream);
                if(!isScreenShare){
                    this.remoteP2PPeers = [...this.remoteP2PPeers ,peerConnectionOffer];
                    remoteClientHandler(this.remoteP2PPeers);
                    this.p2pConnections  = [...this.p2pConnections , connection];
                }
                const remoteView = remoteMedia.getView();
                const l = document.createElement('div');
                l.style.color = "white";
                l.style.position = "absolute";
                l.style.bottom = "25px";
                const label =  peerConnectionOffer._remoteClientInfo._userAlias || peerConnectionOffer._remoteClientInfo._userId ;
                l.innerText = isScreenShare ?`${label}'s screen` : label;
                remoteView.appendChild(l);
                if(peerConnectionOffer._hasAudio){

                    const icon = document.createElement("i");
                    icon.classList.add("fas");
                    icon.classList.add("fa-volume-up");
                    icon.style.color = "white";
                    icon.style.position="absolute";
                    icon.style.bottom="5px";
                    remoteView.appendChild(icon);

                    const audioLevelIndicatorContainer = document.createElement('div');
                    audioLevelIndicatorContainer.style.width="100px";
                    audioLevelIndicatorContainer.style.height="5px";
                    audioLevelIndicatorContainer.style.backgroundColor="lightgray";
                    audioLevelIndicatorContainer.style.position="absolute";
                    audioLevelIndicatorContainer.style.bottom="10px";
                    audioLevelIndicatorContainer.style.left="20px";
                    remoteView.appendChild(audioLevelIndicatorContainer);

                    const audioLevelIndicator = document.createElement('div');
                    audioLevelIndicator.style.height="5px";
                    audioLevelIndicator.style.backgroundColor="lightgreen";
                    audioLevelIndicator.style.position="absolute";
                    audioLevelIndicatorContainer.appendChild(audioLevelIndicator);

                    remoteMedia.addOnAudioLevel(function(level){
                    audioLevelIndicator.style.width = `${level * 100}px`;
                    if(level < 0.00001){
                    icon.classList.add("fa-volume-mute");
                    icon.classList.remove("fa-volume-up");
                    }
                    else{
                    icon.classList.remove("fa-volume-mute");
                    icon.classList.add("fa-volume-up");
                    }
                    });
                }
                if(isScreenShare){
                    this.localLayoutManager.applyPreset(fm.liveswitch.LayoutManager.getGoogleHangouts());
                    this.localLayoutManager.setLocalView(remoteMedia.getView());
                    this.localLayoutManager.layout();
                }
                else{
                    this.localLayoutManager.addRemoteView(remoteMedia.getId(), remoteMedia.getView()); 
                }
                const icon = document.createElement("i");
                icon.classList.add("fas");
                icon.classList.add("fa-video-slash");
                icon.style.color = "white";
                icon.style.position="absolute";
                icon.style.bottom="50%";
                icon.style.left="50%";
                icon.style.fontSize="50px";
                icon.style.display ="none";
                remoteView.appendChild(icon);
                connection.addOnRemoteUpdate(function(c,d){
                    const [videoStream] = d._videoStreams;
                    if(!videoStream){
                    return;
                    }
                    const remoteVideoStopped = videoStream._sendDisabled || videoStream._sendMuted;
                    
                    if(remoteVideoStopped){
                    icon.style.display ="inherit";
                    }
                    else{
                    icon.style.display ="none";
                    }
                });
                connection.addOnStateChange(function(c) {
                    if(c.getState() === fm.liveswitch.ConnectionState.Closing && isScreenShare){
                    this.localLayoutManager.setLocalView(this.localMedia.getView());
                    }
                    if (c.getState() === fm.liveswitch.ConnectionState.Closing || c.getState() === fm.liveswitch.ConnectionState.Failing) {
                    this.localLayoutManager.removeRemoteView(remoteMedia.getId());
                    }
                }.bind(this));
                connection.open().then(function() {
                    console.log("offerer's connection established");
                }).fail(function(ex) {
                    console.log("an error occurred");
                });
            }.bind(this));
            this.channel.addOnRemoteClientJoin(function(remoteClientInfo) {
                //  a new user has joined
                this.remoteP2PPeers = [...this.remoteP2PPeers,remoteClientInfo];
                remoteClientHandler(this.remoteP2PPeers);
                console.log(`${remoteClientInfo._userId} has joined`);
                //create remote media handle
                const remoteMedia = new fm.liveswitch.RemoteMedia();
                //create audio stream with remote and local media handles
                const audioStream = new fm.liveswitch.AudioStream(this.localMedia, remoteMedia);
                const videoStream = new fm.liveswitch.VideoStream(this.localMedia, remoteMedia);
                //create connection to peer
                const connection = this.channel.createPeerConnection(remoteClientInfo, audioStream, videoStream);
                this.p2pConnections  = [...this.p2pConnections , connection];
                const remoteView = remoteMedia.getView();
                const l = document.createElement('div');
                l.style.color = "white";
                l.style.position = "absolute";
                l.style.bottom = "25px";
                l.innerText =  remoteClientInfo._userAlias || remoteClientInfo._userId ;
                remoteView.appendChild(l);
                const videoIcon = document.createElement("i");
                videoIcon.classList.add("fas");
                videoIcon.classList.add("fa-video-slash");
                videoIcon.style.color = "white";
                videoIcon.style.position="absolute";
                videoIcon.style.bottom="50%";
                videoIcon.style.left="50%";
                videoIcon.style.fontSize="50px";
                videoIcon.style.display ="none";
        
                remoteView.appendChild(videoIcon);
                connection.addOnRemoteUpdate(function(c,d){
                    const [videoStream] = d._videoStreams;
                    if(!videoStream){
                    return;
                    }
                    const remoteVideoStopped = videoStream._sendDisabled || videoStream._sendMuted;
                    
                    if(remoteVideoStopped){
                    videoIcon.style.display ="inherit";
                    }
                    else{
                    videoIcon.style.display ="none";
                    }
                });
                const icon = document.createElement("i");
                icon.classList.add("fas");
                icon.classList.add("fa-volume-up");
                icon.style.color = "white";
                icon.style.position="absolute";
                icon.style.bottom="5px";
                remoteView.appendChild(icon);
        
                const audioLevelIndicatorContainer = document.createElement('div');
                audioLevelIndicatorContainer.style.width="100px";
                audioLevelIndicatorContainer.style.height="5px";
                audioLevelIndicatorContainer.style.backgroundColor="lightgray";
                audioLevelIndicatorContainer.style.position="absolute";
                audioLevelIndicatorContainer.style.bottom="10px";
                audioLevelIndicatorContainer.style.left="20px";
                remoteView.appendChild(audioLevelIndicatorContainer);
        
                const audioLevelIndicator = document.createElement('div');
                audioLevelIndicator.id = `${remoteClientInfo._userId}-level-indicator`;
                audioLevelIndicator.style.height="5px";
                audioLevelIndicator.style.backgroundColor="lightgreen";
                audioLevelIndicator.style.position="absolute";
        
                audioLevelIndicatorContainer.appendChild(audioLevelIndicator);
                this.localLayoutManager.addRemoteView(remoteMedia.getId(), remoteMedia.getView()); 
                remoteMedia.addOnAudioLevel(function(level){
                    audioLevelIndicator.style.width = `${level * 100}px`;
                    if(level < 0.00001){
                    icon.classList.add("fa-volume-mute");
                    icon.classList.remove("fa-volume-up");
                    }
                    else{
                    icon.classList.remove("fa-volume-mute");
                    icon.classList.add("fa-volume-up");
                    }
                });
                connection.addOnStateChange(function(c) {
                    if (c.getState() === fm.liveswitch.ConnectionState.Closing || c.getState() === fm.liveswitch.ConnectionState.Failing) {
                    this.localLayoutManager.removeRemoteView(remoteMedia.getId());
                    }
                }.bind(this));
                connection.open().then(function(result) {
                    console.log("offerer's connection established");
                }).fail(function(ex) {
                    console.log(ex);
                    console.log("an error occurred");
                });
            }.bind(this));
            this.channel.addOnRemoteClientLeave(function(clientInfo){
                const { _id } = clientInfo;
                const clientIndex = this.remoteP2PPeers.findIndex((client)=> client._id = _id);
                if(clientIndex !== -1){
                    this.remoteP2PPeers = [...this.remoteP2PPeers.slice(0,clientIndex) , ...this.remoteP2PPeers.slice(clientIndex+1)];
                    remoteClientHandler(this.remoteP2PPeers);
                }
                const connectionIndex = this.p2pConnections.findIndex((conncetion)=> conncetion._remoteClientInfo._id = _id);
                if(connectionIndex !== -1){
                    this.p2pConnections = [...this.p2pConnections.slice(0,connectionIndex) , ...this.p2pConnections.slice(connectionIndex+1)];
                }
            }.bind(this));
            this.channel.addOnMessage(({_deviceId,_userId : userName} , message)=>{
                console.log(message)
                if(this.deviceId === _deviceId){
                    return;
                }
                messageHandler({userName,message});
            });
        }
    }
    async getMediaAudioInputs(){
        try{
            const sources = await this.localMedia.getAudioInputs();
            return sources;
        }
        catch(err){
            console.log(err);
            return [];
        }
    }
    async getMediaVideoInputs(){
        try{
            const sources = await this.localMedia.getVideoInputs();
            return sources;
        }
        catch(err){
            console.log(err);
            return null;
        }
    }
    toggleVideo(){
        if(!this.localMedia){
          return false;
        }
        const localVideoMuted = this.localMedia.getVideoMuted();
        if(!this.p2pConnections.length){
            this.localMedia.setVideoMuted(!localVideoMuted);
            return localVideoMuted;
        }
        this.p2pConnections.forEach(connection => {
          const config = connection.getConfig();
          config.setLocalVideoMuted(!localVideoMuted);
          connection.update(config);
        });
        return localVideoMuted;
      }
    toggleAudio(){
        if(!this.localMedia){
            return false;
        }
        const localAudioMuted = this.localMedia.getAudioMuted();
        if(!this.p2pConnections.length){
            this.localMedia.setAudioMuted(!localAudioMuted);
            return localAudioMuted;
        }
        this.p2pConnections.forEach(connection => {
            const config = connection.getConfig();
            config.setLocalAudioMuted(!localAudioMuted);
            connection.update(config);
        });
        return localAudioMuted;
    }
    async leaveChannel(){
        if(!this.fmClient){
            return true;
        }
        try{
            await this.channel.closeAll();
            await this.fmClient.leave(this.channelId);
            this.p2pConnections = [];
            this.shareScreenConnections = [];
            this.remoteP2PPeers = [];
            return true;
        }
        catch(err){
            console.log(err);
            console.log("unable to leave channel ");
            return false;
        }
    }
    async sendMessage(message){
        try{
            await this.channel.sendMessage(message);
        }
        catch(err){
            console.log(err);
        }
    }
    async cleanUp(){
        if(this.channel){
            this.channel.leave();
            this.channel.closeAll();
            this.channel.removeOnPeerConnectionOffer(()=>{});
            this.channel.removeOnRemoteClientJoin(()=>{});
        }
        await this.localMedia.stop();
        await this.localMedia.destroy();
        await this.fmClient.unregister();
        this.channel = null;
        this.shareScreenConnections = [];
        this.p2pConnections = [];
        this.remoteP2PPeers = [];
    }
}