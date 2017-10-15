console.log('in video script');

// Generate random chatRoom name if needed
if (!location.hash) {
    location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

const vidDrone = new ScaleDrone('GZtLCKtcestPU9LF');
// Room name needs to be prefixed with 'observable-'
const vidRoomName = 'observable-' + roomHash + 'vid';

// ALREADY DECLARED IN CHAT SCRIPT
/*
const configuration = {
    iceServers: [
        {urls: 'stun:stun.l.google.com:19302'}
        //{urls: 'turn:stun.l.google.com:19301?transport=udp'} fixes edge, breaks everything else for some reason
    ]
};
*/

let vidRoom;
let vidPc;


function onVidSuccess() {};
function onVidError(error) {
    console.error(error);
};

vidDrone.on('open', error => {
    if (error) {
        return console.error(error);
    }
    vidRoom = vidDrone.subscribe(vidRoomName);
    vidRoom.on('open', error => {
        if (error) {
            onVidError(error);
        }
    });
    // We're connected to the chatRoom and received an array of 'members'
    // connected to the chatRoom (including us). Signaling server is ready.
    vidRoom.on('members', members => {
        console.log('MEMBERS', members);
        // If we are the second user to connect to the chatRoom we will be creating the offer
        const isVidOfferer = members.length === 2;
        startVidWebRTC(isVidOfferer);
    });
});

// Send signaling data via Scaledrone
function sendVidMessage(message) {
    vidDrone.publish({
        room: vidRoomName,
        message
    });
}

function startVidWebRTC(isOfferer) {
    vidPc = new RTCPeerConnection(configuration);

    // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
    // message to the other peer through the signaling server
    vidPc.onicecandidate = event => {
        if (event.candidate) {
            sendVidMessage({'candidate': event.candidate});
        }
    };



    // If user is offerer let the 'negotiationneeded' event create the offer
    if (isOfferer) {
        vidPc.onnegotiationneeded = () => {
            vidPc.createOffer().then(localVidDescCreated).catch(onVidError);
        }
    }




    // When a remote stream arrives display it in the #remoteVideo element
    vidPc.onaddstream = event => {
        remoteVideo.srcObject = event.stream;
    };

    navigator.getUserMedia = ( navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia);

    if (navigator.getUserMedia) {
        // Call the getUserMedia method here
    } else {
        console.log('Native device media streaming (getUserMedia) not supported in this browser.');
        // Display a friendly "sorry" message to the user.
    }

    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
    }).then(stream => {
        // Display your local video in #localVideo element
        localVideo.srcObject = stream;
        // Add your stream to be sent to the conneting peer
        vidPc.addStream(stream);
    }, onVidError);

    // Listen to signaling data from Scaledrone
    vidRoom.on('data', (message, client) => {
        // Message was sent by us
        if (client.id === vidDrone.clientId) {
            return;
        }

        if (message.sdp) {
            // This is called after receiving an offer or answer from another peer
            vidPc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                // When receiving an offer lets answer it
                if (vidPc.remoteDescription.type === 'offer') {
                    vidPc.createAnswer().then(localVidDescCreated).catch(onVidError);
                }
            }, onVidError);
        } else if (message.candidate) {
            // Add the new ICE candidate to our connections remote description
            vidPc.addIceCandidate(
                new RTCIceCandidate(message.candidate), onVidSuccess, onVidError
            );
        }
    });
}


function localVidDescCreated(desc) {
    vidPc.setLocalDescription(
        desc,
        () => sendVidMessage({'sdp': vidPc.localDescription}),
        onVidError
    );
}
